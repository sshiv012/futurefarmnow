package edu.ucr.cs.bdlab.raptor

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.databind.ObjectMapper
import edu.ucr.cs.bdlab.beast.cg.Reprojector
import edu.ucr.cs.bdlab.beast.geolite.RasterMetadata
import edu.ucr.cs.bdlab.beast.common.{BeastOptions, WebMethod}
import edu.ucr.cs.bdlab.beast.indexing.RTreeFeatureReader
import edu.ucr.cs.bdlab.beast.io.{GeoJSONFeatureReader, SpatialFileRDD}
import edu.ucr.cs.bdlab.beast.util.AbstractWebHandler
import org.apache.hadoop.conf.Configuration
import org.apache.hadoop.fs.FileSystem
import org.apache.commons.io.IOUtils
import org.apache.hadoop.fs.Path
import org.apache.hadoop.mapreduce.lib.input.FileSplit
import org.apache.spark.internal.Logging
import org.apache.spark.sql.SparkSession
import org.geotools.referencing.operation.transform.{AffineTransform2D, ConcatenatedTransform}
import org.locationtech.jts.geom.{Envelope, Geometry, GeometryFactory}
import org.locationtech.jts.io.ParseException
import org.opengis.referencing.operation.MathTransform

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.awt.{Color}
import java.awt.image.BufferedImage
import java.security.MessageDigest
import java.util.Base64
import javax.imageio.ImageIO
import javax.servlet.http.{HttpServletRequest, HttpServletResponse}
import scala.collection.JavaConverters.asScalaIteratorConverter
import scala.collection.mutable.ArrayBuffer

class NDVIServlet extends AbstractWebHandler with Logging {

  /** Additional options passed on by the user to override existing options */
  var opts: BeastOptions = _

  /** The SparkSession that is used to process datasets */
  var sparkSession: SparkSession = _

  /** The path at which this server keeps all datasets */
  var ndviDataPath: Path = _
  
  /** The path at which this server keeps Landsat datasets */
  var landsatDataPath: Path = _
  
  /** Base data path */
  var baseDataPath: Path = _

  override def setup(ss: SparkSession, opts: BeastOptions): Unit = {
    super.setup(ss, opts)
    this.opts = opts
    this.sparkSession = ss
    val dataPath: String = opts.getString("datapath", "data")
    baseDataPath = new Path(dataPath)
    ndviDataPath = new Path(dataPath, "NDVI")
    landsatDataPath = new Path(dataPath, "LANDSAT")

    // Build indexes if not existent for both NDVI and Landsat data
    val sc = ss.sparkContext
    val fs = baseDataPath.getFileSystem(sc.hadoopConfiguration)
    
    // Build indexes for NDVI data
    if (fs.exists(ndviDataPath)) {
      val ndviDirectories = fs.listStatus(ndviDataPath,
        (path: Path) => path.getName.matches("\\d+-\\d+-\\d+"))
      for (dir <- ndviDirectories) {
        val indexPath = new Path(dir.getPath, "_index.csv")
        if (!fs.exists(indexPath)) {
          try {
            logInfo(s"Building a raster index for NDVI '${dir.getPath}'")
            RasterFileRDD.buildIndex(sc, dir.getPath.toString, indexPath.toString)
          } catch {
            case e: Exception =>
              logError(s"Failed to build index for NDVI directory '${dir.getPath}': ${e.getMessage}")
              logError("This may be due to permission issues or missing data. NDVI analysis will be unavailable for this directory.")
          }
        }
      }
    }
    
    // Build indexes for Landsat data
    if (fs.exists(landsatDataPath)) {
      val landsatDirectories = fs.listStatus(landsatDataPath,
        (path: Path) => path.getName.matches("\\d+-\\d+-\\d+"))
      for (dir <- landsatDirectories) {
        val indexPath = new Path(dir.getPath, "_index.csv")
        if (!fs.exists(indexPath)) {
          try {
            logInfo(s"Building a raster index for Landsat '${dir.getPath}'")
            RasterFileRDD.buildIndex(sc, dir.getPath.toString, indexPath.toString)
          } catch {
            case e: Exception =>
              logError(s"Failed to build index for Landsat directory '${dir.getPath}': ${e.getMessage}")
              logError("This may be due to permission issues or missing data. Landsat analysis will be unavailable for this directory.")
          }
        }
      }
    }
  }

  /**
   * Get the data path based on the data source parameter
   * @param dataSource The data source type ("landsat" or default "ndvi")
   * @return The appropriate data path
   */
  private def getDataPath(dataSource: String): Path = {
    dataSource.toLowerCase match {
      case "landsat" => landsatDataPath
      case _ => ndviDataPath // Default to NDVI
    }
  }

  /**
   * Computes the NDVI time series for a give query polygon and a time range
   * @param path
   * @param request
   * @param response
   * @return
   */
  @WebMethod(url = "/ndvi/singlepolygon.json", order = 1)
  def singlePolygon(path: String, request: HttpServletRequest, response: HttpServletResponse): Boolean = {
    // Date range
    var dateFrom = ""
    var dateTo = ""
    var dataSource = ""

    // try getting parameters from url
    try {
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
      dataSource = Option(request.getParameter("source")).getOrElse("ndvi") // Default to NDVI
    } catch {
      case e: NullPointerException => throw new RuntimeException("Couldn't find the required parameters: from and to")
    }

    // set content-type as application/json// set content-type as application/json
    response.setContentType("application/json")
    response.setStatus(HttpServletResponse.SC_OK)

    // Get the appropriate data path based on source parameter
    val currentDataPath = getDataPath(dataSource)
    logInfo(s"singlePolygon: Using data source: '$dataSource', data path: '$currentDataPath'")
    
    // load raster data based on selected date range
    val fileSystem = currentDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(currentDataPath,
      (path: Path) => NDVIServlet.dateRangeOverlap(dateFrom, dateTo, path.getName))
      .map(_.getPath.toString)
    logDebug(s"Query matched dirs: ${matchingRasterDirs.mkString(",")}")

    val baos = new ByteArrayOutputStream
    val input = request.getInputStream
    IOUtils.copy(input, baos)
    input.close()
    baos.close()
    val geoJSONData: Array[Byte] = baos.toByteArray
    var geom: Geometry = null
    try {
      val jsonParser = new JsonFactory().createParser(new ByteArrayInputStream(geoJSONData))
      geom = GeoJSONFeatureReader.parseGeometry(jsonParser)
      geom.setSRID(4326)
      jsonParser.close()
    } catch {
      case e: Exception =>
        logError(s"Error parsing GeoJSON geometry ${new String(geoJSONData)}", e)
        throw new RuntimeException(s"Error parsing query geometry ${new String(geoJSONData)}", e)
    }

    // Now that we have the query geometry, loop over al matching directories and run the NDVI query
    val results: Array[(String, Float)] = matchingRasterDirs.map(matchingRasterDir => {
      logInfo(s"Currently using $matchingRasterDir")
      val matchingFiles: Array[String] = RasterFileRDD.selectFiles(fileSystem, matchingRasterDir, geom)
      if (matchingFiles.nonEmpty) logInfo(s"Query matched files: ${matchingFiles.mkString(",")}")
      if (matchingFiles.isEmpty) {
        logDebug(s"No matching files found for $matchingRasterDir")
        null
      } else {
        // Use RaptorJoin to find the results
        val resultsIterator = SingleMachineRaptorJoin.raptorJoin[Int](matchingFiles, Array(geom))
        if (resultsIterator == null) {
          null
        } else {
          // Convert Iterator to Array to avoid consumption issues
          val results = resultsIterator.toArray
          val date = new Path(matchingRasterDir).getName
          val totalPixels = results.length
          val nonZeroPixels = results.filter(x => x._2 != 0 && x._2 != 255)
          
          if (nonZeroPixels.isEmpty) {
            // No valid pixels found for this date - log and skip
            logInfo(s"No valid NDVI pixels found for date $date:")
            logInfo(s"  Files used: ${matchingFiles.mkString(", ")}")
            logInfo(s"  Total pixels: $totalPixels")
            null
          } else {
            val scaledValues = nonZeroPixels.map(x => x._2.toFloat * (2.0f / 254) - 1)
            
            // Log detailed info for zero NDVI cases
            if (scaledValues.forall(_ == 0.0f)) {
              logInfo(s"ZERO NDVI detected for date $date:")
              logInfo(s"  Files used: ${matchingFiles.mkString(", ")}")
              logInfo(s"  Total pixels: $totalPixels")
              logInfo(s"  Non-zero pixels: ${nonZeroPixels.size}")
              val rawValues = nonZeroPixels.map(_._2).take(10)
              logInfo(s"  Sample raw values: ${rawValues.mkString(", ")}")
              logInfo(s"  Raw value range: ${nonZeroPixels.map(_._2).min} to ${nonZeroPixels.map(_._2).max}")
            }
            val meanValue = scaledValues.sum / scaledValues.length
            (date, meanValue)
          }
        }
      }
    }).filter(_ != null)

    // write result to json object
    val resWriter = response.getWriter
    val mapper = new ObjectMapper

    // create query node
    val queryNode = mapper.createObjectNode
    queryNode.put("from", dateFrom)
    queryNode.put("to", dateTo)

    // create results node
    val resultsNode = mapper.createArrayNode()
    for (result <- results) {
      val resultNode = mapper.createObjectNode()
      resultNode.put("date", result._1)
      resultNode.put("mean", result._2)
      resultsNode.add(resultNode)
    }

    // Create a root node that contains queryNode and resultsNode
    val rootNode = mapper.createObjectNode
    rootNode.put("engine", "Beast")
    rootNode.set("query", queryNode)
    rootNode.set("results", resultsNode)

    // write values to response writer
    val jsonString = mapper.writer.writeValueAsString(rootNode)
    resWriter.print(jsonString)
    resWriter.flush()
    true
  }

  @WebMethod(url = "/ndvi/{datasetID}.json", order = 99)
  def queryVector(path: String, request: HttpServletRequest, response: HttpServletResponse, datasetID: String): Boolean = {
    // time at start of GET request
    val t1 = System.nanoTime

    response.setContentType("application/json")
    response.setStatus(HttpServletResponse.SC_OK)

    // Load the Farmland features
    val indexPath = new Path(VectorServlet.getIndexPathById(VectorServlet.VectorIndexFile, datasetID))
    val reader = new RTreeFeatureReader
    val fs = indexPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val fileLength = fs.getFileStatus(indexPath).getLen
    val inputFileSplit = new FileSplit(indexPath, 0, fileLength, null)
    val opts = new BeastOptions
    var dateFrom: String = null
    var dateTo: String = null
    var dataSource: String = null
    var mbr: Envelope = null
    var searchGeom: Geometry = null
    try {
      // get sidebar select parameters
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
      dataSource = Option(request.getParameter("source")).getOrElse("ndvi") // Default to NDVI
      // get extents parameters
      val minx = request.getParameter("minx").toDouble
      val miny = request.getParameter("miny").toDouble
      val maxx = request.getParameter("maxx").toDouble
      val maxy = request.getParameter("maxy").toDouble
      mbr = new Envelope(minx, maxx, miny, maxy)
      searchGeom = new GeometryFactory().toGeometry(mbr)
      searchGeom.setSRID(4326)
      opts.set(SpatialFileRDD.FilterMBR, Array(minx, miny, maxx, maxy).mkString(","))
    } catch {
      case e: NullPointerException =>
    }
    // MBR not passed. Use all farmlands
    if (dateFrom == null || dateTo == null) {
      val writer = response.getWriter
      writer.printf("{\"error\": \"Error! Both 'from' and 'to' parameters are required\"}")
      return true
    }
    // Initialize the reader that reads the relevant farmlands
    reader.initialize(inputFileSplit, opts)
    // Retrieve in an array to prepare the zonal statistics calculation// Retrieve in an array to prepare the zonal statistics calculation
    val farmlands = reader.asScala.toArray
    reader.close()
    logInfo(s"Read ${farmlands.length} records in ${(System.nanoTime() - t1) *1E-9} seconds")

    // Get the appropriate data path based on source parameter
    val currentDataPath = getDataPath(dataSource)
    
    // load raster data based on selected date range
    val fileSystem = currentDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(currentDataPath,
        (path: Path) => NDVIServlet.dateRangeOverlap(dateFrom, dateTo, path.getName))
      .map(_.getPath.toString)
    
    logInfo(s"Found ${matchingRasterDirs.length} matching raster directories for date range $dateFrom to $dateTo")
    
    if (matchingRasterDirs.isEmpty) {
      logInfo(s"No matching directories found for date range $dateFrom to $dateTo")
    }

    val finalResults: Array[ArrayBuffer[(String, Float)]] = new Array[ArrayBuffer[(String, Float)]](farmlands.length)
      .map(_ => new ArrayBuffer[(String, Float)]())
    val geoms: Array[Geometry] = farmlands.map(_.getGeometry)
    for (matchingRasterDir <- matchingRasterDirs) {
      val date = new Path(matchingRasterDir).getName
      val matchingFiles = RasterFileRDD.selectFiles(fileSystem, matchingRasterDir, searchGeom)
      if (matchingFiles.nonEmpty) {
        // Use RaptorJoin to find the results - try single-band first
        try {
          // Default: single-band data (Int) for preprocessed NDVI data
          val rjResults = SingleMachineRaptorJoin.raptorJoin[Int](matchingFiles, geoms)
          val averages: Array[(Float, Int)] = Array.fill(geoms.length)((0.0f, 0))
          val ndvis: Iterator[(Long, Float)] = rjResults
            .filter(x => x._2 != 0 && x._2 != 255)
            .map(x => (x._1, x._2.toFloat * (2.0f / 254) - 1)) 
          for (ndvi <- ndvis) {
            val sumCount: (Float, Int) = averages(ndvi._1.toInt)
            averages(ndvi._1.toInt) = (sumCount._1 + ndvi._2, sumCount._2 + 1)
          }
          for (iGeom <- averages.indices) {
            if (averages(iGeom)._2 > 0) {
              finalResults(iGeom).append((date, averages(iGeom)._1 / averages(iGeom)._2))
            }
          }
        } catch {
          case e: ClassCastException =>
            // Fallback: multi-band data (Array[Int]) for Sentinel-2 raw data
            try {
              val rjResults = SingleMachineRaptorJoin.raptorJoin[Array[Int]](matchingFiles, geoms)
              // Since we have one geometry, all the results are for a single geometry
              val averages: Array[(Float, Int)] = Array.fill(geoms.length)((0.0f, 0))
              val ndvis: Iterator[(Long, Float)] = rjResults
                .filter(x => x._2(0) + x._2(3) > 0) // Drop records with a denominator of zero
                .map(x => (x._1, (x._2(0).toFloat - x._2(3)) / (x._2(0).toFloat + x._2(3)))) // NDVI Equation
              // Note that the RaptorJoin results are ordered by geometry ID
              for (ndvi <- ndvis) {
                val sumCount: (Float, Int) = averages(ndvi._1.toInt)
                averages(ndvi._1.toInt) = (sumCount._1 + ndvi._2, sumCount._2 + 1)
              }
              for (iGeom <- averages.indices) {
                if (averages(iGeom)._2 > 0) {
                  finalResults(iGeom).append((date, averages(iGeom)._1 / averages(iGeom)._2))
                }
              }
            } catch {
              case e2: Exception =>
                logError(s"Failed to process NDVI data for date $date: ${e2.getMessage}")
            }
        }
      }
    }

    // write results to json object// write results to json object
    val out = response.getWriter
    val mapper = new ObjectMapper

    // create query node// create query node
    val queryNode = mapper.createObjectNode
    queryNode.put("from", dateFrom)
    queryNode.put("to", dateTo)

    // create mbr node// create mbr node
    // inside query node// inside query node
    if (mbr != null) {
      val mbrNode = mapper.createObjectNode
      mbrNode.put("minx", mbr.getMinX)
      mbrNode.put("miny", mbr.getMinY)
      mbrNode.put("maxx", mbr.getMaxX)
      mbrNode.put("maxy", mbr.getMaxY)
      queryNode.set("mbr", mbrNode)
    }

    // create results node
    val resultsNode = mapper.createArrayNode

    // populate json object with max vals
    for (i <- finalResults.indices) {
      val s: ArrayBuffer[(String, Float)] = finalResults(i)
      if (s != null) {
        val resultNode = mapper.createObjectNode
        resultNode.put("objectid", farmlands(i).getAs("OBJECTID").asInstanceOf[Number].longValue)
        val ndvis = mapper.createArrayNode()
        for ((date, ndvi) <- s) {
          val ndviNode = mapper.createObjectNode()
          ndviNode.put("date", date)
          ndviNode.put("mean", ndvi)
          ndvis.add(ndviNode)
        }
        resultNode.set("results", ndvis)
        resultsNode.add(resultNode)
      }
    }

    // create root node// create root node
    // contains queryNode and resultsNode// contains queryNode and resultsNode
    val rootNode = mapper.createObjectNode
    rootNode.put("engine", "Beast")
    rootNode.set("query", queryNode)
    rootNode.set("results", resultsNode)

    // write values to response writer// write values to response writer
    val jsonString = mapper.writer.writeValueAsString(rootNode)
    out.print(jsonString)
    out.flush()
    true
  }
  
  /**
   * Returns a single NDVI image as PNG for a specific date
   * @param path
   * @param request
   * @param response
   * @return
   */
  @WebMethod(url = "/ndvi/image.png", order = 1)
  def ndviImage(path: String, request: HttpServletRequest, response: HttpServletResponse): Boolean = {
    val t1 = System.nanoTime()
    
    // Get single date parameter
    var date = ""
    var dataSource = ""
    
    try {
      date = request.getParameter("date")
      dataSource = Option(request.getParameter("source")).getOrElse("ndvi") // Default to NDVI
    } catch {
      case e: NullPointerException => throw new RuntimeException("Couldn't find the required parameter: date")
    }
    
    // Set response headers
    response.setContentType("image/png")
    response.setStatus(HttpServletResponse.SC_OK)
    
    // Set caching headers for browser caching
    response.setHeader("Cache-Control", "public, max-age=86400") // Cache for 24 hours
    response.setHeader("ETag", s"ndvi-$date-$dataSource") // ETag for conditional requests
    response.setDateHeader("Expires", System.currentTimeMillis() + 86400000) // Expires in 24 hours
    
    // Parse GeoJSON polygon from request body
    val baos = new ByteArrayOutputStream
    val input = request.getInputStream
    IOUtils.copy(input, baos)
    input.close()
    baos.close()
    val geoJSONData: Array[Byte] = baos.toByteArray
    var geom: Geometry = null
    
    try {
      val jsonParser = new JsonFactory().createParser(new ByteArrayInputStream(geoJSONData))
      geom = GeoJSONFeatureReader.parseGeometry(jsonParser)
      geom.setSRID(4326)
      jsonParser.close()
    } catch {
      case e: Exception =>
        logError(s"Error parsing GeoJSON geometry ${new String(geoJSONData)}", e)
        throw new RuntimeException(s"Error parsing query geometry ${new String(geoJSONData)}", e)
    }
    
    // Get the appropriate data path based on source parameter
    val currentDataPath = getDataPath(dataSource)
    
    // Find data for the specific date
    val fileSystem = currentDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(currentDataPath,
      (path: Path) => path.getName == date)
      .map(_.getPath.toString)
    
    logInfo(s"Found ${matchingRasterDirs.length} matching ${dataSource.toUpperCase} directories for date $date")
    
    if (matchingRasterDirs.isEmpty) {
      logError(s"No data found for date $date")
      response.sendError(HttpServletResponse.SC_NOT_FOUND, s"No data found for date $date")
      return false
    }
    
    // Process the single matching date
    val matchingRasterDir = matchingRasterDirs.head
    try {
      val matchingFiles = RasterFileRDD.selectFiles(fileSystem, matchingRasterDir, geom)
        
        if (matchingFiles.nonEmpty) {
          // Get pixel data using RaptorJoin
          val resultsIterator = SingleMachineRaptorJoin.raptorJoin[Int](matchingFiles, Array(geom))
          
          if (resultsIterator != null) {
            // Convert Iterator to Array to avoid consumption issues
            val results = resultsIterator.toArray
            
            if (results.nonEmpty) {
              // Filter and scale NDVI values
              val nonZeroPixels = results.filter(x => x._2 != 0 && x._2 != 255)
              val scaledValues = nonZeroPixels.map(x => x._2.toFloat * (2.0f / 254) - 1)
              
              if (scaledValues.nonEmpty) {
                // Calculate optimal resolution based on polygon aspect ratio
                val envelope = geom.getEnvelopeInternal
                val widthDegrees = envelope.getWidth
                val heightDegrees = envelope.getHeight
                val aspectRatio = widthDegrees / heightDegrees
                
                // Calculate image dimensions based on target ground resolution
                // Landsat: 30m/pixel, Sentinel-2: 10m/pixel
                // We want to standardize to 10m/pixel for both
                val targetGroundResolution = 10.0 // meters per pixel
                val sourceGroundResolution = if (dataSource.toLowerCase == "landsat") 30.0 else 10.0 // meters per pixel
                
                // Calculate the image dimensions based on geographic extent and target resolution
                // Convert degrees to meters (approximate, assumes Web Mercator projection)
                val imageMBR = Reprojector.reprojectEnvelope(envelope, 4326, 3857)
                val widthMeters = imageMBR.getWidth
                val heightMeters = imageMBR.getHeight
                
                // Calculate pixel dimensions for target resolution
                val imageWidth = (widthMeters / targetGroundResolution).toInt
                val imageHeight = (heightMeters / targetGroundResolution).toInt
                
                // Limit maximum dimensions for performance
                val maxDimension = 2048
                val (finalImageWidth, finalImageHeight) = if (imageWidth > maxDimension || imageHeight > maxDimension) {
                  val scale = math.min(maxDimension.toDouble / imageWidth, maxDimension.toDouble / imageHeight)
                  ((imageWidth * scale).toInt, (imageHeight * scale).toInt)
                } else {
                  (imageWidth, imageHeight)
                }
                
                logInfo(s"Data source: $dataSource, Source resolution: ${sourceGroundResolution}m/pixel, Target resolution: ${targetGroundResolution}m/pixel")
                logInfo(s"Geographic extent: ${widthMeters.toInt}m x ${heightMeters.toInt}m")
                logInfo(s"Image dimensions: ${finalImageWidth}x${finalImageHeight}")
                
                // Get the pixel data using SingleMachineRaptorJoin with proper result structure
                // We need to use a different approach to get spatial coordinates
                val fileSystem = new Path(matchingRasterDir).getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
                val intersections: Array[(Int, Intersections)] = matchingFiles.zipWithIndex.map({ case (rasterFileName: String, index: Int) =>
                  val rasterFS: FileSystem = new Path(rasterFileName).getFileSystem(new Configuration())
                  val rasterReader = RasterHelper.createRasterReader(rasterFS, new Path(rasterFileName), new BeastOptions())
                  val intersections = new Intersections()
                  intersections.compute(Array(geom), rasterReader.metadata)
                  rasterReader.close()
                  (index, intersections)
                }).filter(_._2.getNumIntersections > 0)
                
                if (intersections.nonEmpty) {
                  val intersectionIterator: Iterator[(Long, PixelRange)] = new IntersectionsIterator(intersections.map(_._1), intersections.map(_._2))
                  val pixels: Iterator[RaptorJoinResult[Int]] = new PixelIterator[Int](intersectionIterator, matchingFiles, "0")
                  
                  // Arrange the pixels in an image using proper coordinate transformation
                  val sums = new Array[Float](finalImageWidth * finalImageHeight)
                  val counts = new Array[Int](finalImageWidth * finalImageHeight)
                  val geomMBR = Reprojector.reprojectEnvelope(geom.getEnvelopeInternal, 4326, 3857)
                  val imageMetadata = RasterMetadata.create(geomMBR.getMinX, geomMBR.getMaxY, geomMBR.getMaxX, geomMBR.getMinY,
                    3857, finalImageWidth, finalImageHeight, finalImageWidth, finalImageHeight)

                  val cachedTransformations: scala.collection.mutable.HashMap[RasterMetadata, MathTransform] =
                    scala.collection.mutable.HashMap.empty[RasterMetadata, MathTransform]

                  for (pixel <- pixels) {
                    if (pixel.m != 0 && pixel.m != 255) { // Only process valid NDVI pixels (exclude 0 and 255 noData)
                      val pixelMBR = Array[Double](pixel.x, pixel.y,
                        pixel.x + 1, pixel.y,
                        pixel.x + 1, pixel.y + 1,
                        pixel.x, pixel.y + 1,
                      )
                      val transformation = cachedTransformations.getOrElseUpdate(pixel.rasterMetadata, {
                        val t1 = new AffineTransform2D(pixel.rasterMetadata.g2m)
                        val t2 = Reprojector.findTransformationInfo(pixel.rasterMetadata.srid, 3857).mathTransform
                        val t3 = new AffineTransform2D(imageMetadata.g2m.createInverse())
                        ConcatenatedTransform.create(t1, ConcatenatedTransform.create(t2, t3))
                      })
                      transformation.transform(pixelMBR, 0, pixelMBR, 0, 4)
                      val minX: Int = 0 max (pixelMBR(0).round min pixelMBR(2).round min pixelMBR(4).round min pixelMBR(6).round).toInt
                      val maxX: Int = finalImageWidth min (pixelMBR(0).round max pixelMBR(2).round max pixelMBR(4).round max pixelMBR(6).round).toInt
                      val minY: Int = 0 max (pixelMBR(1).round min pixelMBR(3).round min pixelMBR(5).round min pixelMBR(7).round).toInt
                      val maxY: Int = finalImageHeight min (pixelMBR(1).round max pixelMBR(3).round max pixelMBR(5).round max pixelMBR(7).round).toInt
                      for (y <- minY until maxY; x <- minX until maxX) {
                        val offset = y * finalImageWidth + x
                        // Scale NDVI value from [0, 254] to [-1, +1] for coloring
                        val ndviValue = pixel.m.toFloat * (2.0f / 254) - 1
                        sums(offset) += ndviValue
                        counts(offset) = counts(offset) + 1
                      }
                    }
                  }
                  
                  // Convert the array of values to an image using NDVI coloring
                  val averages = counts.zip(sums).map(x => if(x._1 == 0) Float.NaN else x._2 / x._1)
                  val targetImage = new BufferedImage(finalImageWidth, finalImageHeight, BufferedImage.TYPE_INT_ARGB)
                  for (offset <- averages.indices; if counts(offset) > 0) {
                    val x = offset % finalImageWidth
                    val y = offset / finalImageWidth
                    val ndviValue = averages(offset)
                    if (!ndviValue.isNaN) {
                      val color = NDVIServlet.ndviToColor(ndviValue)
                      targetImage.setRGB(x, y, color.getRGB)
                    }
                  }
                  
                  // Grayscale version (commented out)
                  // val minM = averages.filterNot(_.isNaN).min
                  // val maxM = averages.filterNot(_.isNaN).max
                  // val scale: Int = ((ndviValue - minM) * 255 / (maxM - minM)).toInt
                  // val color = new Color(scale, scale, scale)
                  
                  // Write PNG image directly to response
                  val out = response.getOutputStream
                  ImageIO.write(targetImage, "png", out)
                  out.close()
                  logInfo(s"Image generation took ${(System.nanoTime() - t1)*1E-9} seconds")
                  return true
                } else {
                  logError(s"No spatial intersections found for date $date")
                  response.sendError(HttpServletResponse.SC_NOT_FOUND, s"No spatial intersections found for date $date")
                  return false
                }
              } else {
                logError(s"No valid NDVI values found for date $date")
                response.sendError(HttpServletResponse.SC_NOT_FOUND, s"No valid NDVI values found for date $date")
                return false
              }
            } else {
              logError(s"No pixel results found for date $date")
              response.sendError(HttpServletResponse.SC_NOT_FOUND, s"No pixel results found for date $date")
              return false
            }
          } else {
            logError(s"Failed to process raster data for date $date")
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, s"Failed to process raster data for date $date")
            return false
          }
        } else {
          logError(s"No matching files found for date $date")
          response.sendError(HttpServletResponse.SC_NOT_FOUND, s"No matching files found for date $date")
          return false
        }
    } catch {
      case e: Exception =>
        logError(s"Error generating NDVI image for date $date", e)
        response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, s"Error generating NDVI image: ${e.getMessage}")
        return false
    }
  }
}

object NDVIServlet {
  def dateRangeOverlap(from: String, to: String, date: String): Boolean = {
    // Since the string format is yyyy-mm-dd, we can just compare using string
    date >= from && date <= to
  }
  
  /** Token expiration time in milliseconds (5 minutes) */
  val TOKEN_EXPIRATION_MS: Long = 5 * 60 * 1000
  
  /**
   * Generate a secure token that encodes polygon geometry and timestamp
   */
  def generateSecureToken(geom: Geometry, dateFrom: String, dateTo: String): String = {
    val timestamp = System.currentTimeMillis()
    val data = s"${geom.toText}|$dateFrom|$dateTo|$timestamp"
    val hash = MessageDigest.getInstance("MD5").digest(data.getBytes("UTF-8"))
    val token = Base64.getEncoder.encodeToString(hash).take(16)
    s"${token}_${timestamp}"
  }
  
  /**
   * Generate polygon hash for validation
   */
  def generatePolygonHash(geom: Geometry): String = {
    val hash = MessageDigest.getInstance("MD5").digest(geom.toText.getBytes("UTF-8"))
    Base64.getEncoder.encodeToString(hash).take(12)
  }
  
  /**
   * Validate token and extract timestamp
   */
  def validateToken(token: String): Boolean = {
    try {
      val parts = token.split("_")
      if (parts.length != 2) return false
      val timestamp = parts(1).toLong
      val currentTime = System.currentTimeMillis()
      currentTime - timestamp < TOKEN_EXPIRATION_MS
    } catch {
      case _: Exception => false
    }
  }
  
  /**
   * Convert NDVI value to RGB color for visualization using gray-red-orange-yellow-green scale
   * NDVI values range from -1 (water/non-vegetation) to +1 (dense vegetation)
   * Color breakpoints: (0, 0.07, 0.15, 0.23, 0.3, 0.37, 0.45, 0.51, 0.58, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1)
   */
  def ndviToColor(ndvi: Float): Color = {
    val clampedNdvi = Math.max(0.0f, Math.min(1.0f, ndvi))
    
    // Define color breakpoints and corresponding RGB values
    val breakpoints = Array(0.0f, 0.07f, 0.15f, 0.23f, 0.3f, 0.37f, 0.45f, 0.51f, 0.58f, 0.65f, 0.7f, 0.75f, 0.8f, 0.85f, 0.9f, 0.95f, 1.0f)
    val colors = Array(
      new Color(128, 128, 128), // Gray (0.0)
      new Color(165, 0, 38),    // Dark red (0.07)
      new Color(215, 48, 39),   // Red (0.15)
      new Color(244, 109, 67),  // Red-orange (0.23)
      new Color(253, 174, 97),  // Orange (0.3)
      new Color(254, 224, 139), // Orange-yellow (0.37)
      new Color(255, 255, 191), // Light yellow (0.45)
      new Color(217, 239, 139), // Yellow-green (0.51)
      new Color(166, 217, 106), // Light green (0.58)
      new Color(102, 189, 99),  // Green (0.65)
      new Color(65, 171, 93),   // Medium green (0.7)
      new Color(35, 139, 69),   // Dark green (0.75)
      new Color(0, 109, 44),    // Very dark green (0.8)
      new Color(0, 90, 50),     // Forest green (0.85)
      new Color(0, 70, 35),     // Deep green (0.9)
      new Color(0, 50, 25),     // Very deep green (0.95)
      new Color(0, 40, 20)      // Darkest green (1.0)
    )
    
    // Find the appropriate color segment
    var i = 0
    while (i < breakpoints.length - 1 && clampedNdvi > breakpoints(i + 1)) {
      i += 1
    }
    
    // If exact match, return the color
    if (i == breakpoints.length - 1 || clampedNdvi == breakpoints(i)) {
      return colors(i)
    }
    
    // Interpolate between two colors
    val t = (clampedNdvi - breakpoints(i)) / (breakpoints(i + 1) - breakpoints(i))
    val color1 = colors(i)
    val color2 = colors(i + 1)
    
    val r = (color1.getRed * (1 - t) + color2.getRed * t).toInt
    val g = (color1.getGreen * (1 - t) + color2.getGreen * t).toInt
    val b = (color1.getBlue * (1 - t) + color2.getBlue * t).toInt
    
    new Color(r, g, b)
  }
}