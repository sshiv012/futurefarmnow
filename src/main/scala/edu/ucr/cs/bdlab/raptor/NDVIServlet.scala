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

  override def setup(ss: SparkSession, opts: BeastOptions): Unit = {
    super.setup(ss, opts)
    this.opts = opts
    this.sparkSession = ss
    val dataPath: String = opts.getString("datapath", "data")
    ndviDataPath = new Path(dataPath, "NDVI")

    // Build indexes if not existent
    val sc = ss.sparkContext
    val fs = ndviDataPath.getFileSystem(sc.hadoopConfiguration)
    val directories = fs.listStatus(ndviDataPath,
      (path: Path) => path.getName.matches("\\d+-\\d+-\\d+"))
    for (dir <- directories) {
      val indexPath = new Path(dir.getPath, "_index.csv")
      if (!fs.exists(indexPath)) {
        logInfo(s"Building a raster index for '${dir.getPath}'")
        RasterFileRDD.buildIndex(sc, dir.getPath.toString, indexPath.toString)
      }
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

    // try getting parameters from url
    try {
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
    } catch {
      case e: NullPointerException => throw new RuntimeException("Couldn't find the required parameters: from and to")
    }

    // set content-type as application/json// set content-type as application/json
    response.setContentType("application/json")
    response.setStatus(HttpServletResponse.SC_OK)

    // load raster data based on selected date range
    val fileSystem = ndviDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(ndviDataPath,
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
          val nonZeroPixels = results.filter(x => x._2 != 0)
          
          if (nonZeroPixels.isEmpty) {
            // No valid pixels found for this date - log and skip
            logInfo(s"No valid NDVI pixels found for date $date:")
            logInfo(s"  Files used: ${matchingFiles.mkString(", ")}")
            logInfo(s"  Total pixels: $totalPixels")
            null
          } else {
            val scaledValues = nonZeroPixels.map(x => (x._2 - 1.0f) * (2.0f / 254) - 1)
            
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
    var mbr: Envelope = null
    var searchGeom: Geometry = null
    try {
      // get sidebar select parameters
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
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

    // load raster data based on selected date range
    val fileSystem = ndviDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(ndviDataPath,
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
            .filter(x => x._2 != 0)
            .map(x => (x._1, (x._2.toFloat - 1.0f) * (2.0f / 254) - 1)) 
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
   * Returns available NDVI dates and metadata for image visualization with time slider
   * @param path
   * @param request
   * @param response
   * @return
   */
  @WebMethod(url = "/ndvix/imagemeta.json", order = 2)
  def imageMetadata(path: String, request: HttpServletRequest, response: HttpServletResponse): Boolean = {
    val t1 = System.nanoTime()
    
    // Get date range parameters
    var dateFrom = ""
    var dateTo = ""
    
    try {
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
    } catch {
      case e: NullPointerException => throw new RuntimeException("Couldn't find the required parameters: from and to")
    }
    
    // Set response headers
    response.setContentType("application/json")
    response.setStatus(HttpServletResponse.SC_OK)
    
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
    
    // Generate secure token that encodes polygon geometry and timestamp
    val token = NDVIServlet.generateSecureToken(geom, dateFrom, dateTo)
    
    // Find matching date directories
    val fileSystem = ndviDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(ndviDataPath,
      (path: Path) => NDVIServlet.dateRangeOverlap(dateFrom, dateTo, path.getName))
      .map(_.getPath.toString)
      .sortBy(path => new Path(path).getName) // Sort by date
    
    logInfo(s"Found ${matchingRasterDirs.length} matching NDVI directories for image metadata")
    
    // Build response JSON
    val mapper = new ObjectMapper
    val rootNode = mapper.createObjectNode()
    
    // Add token and metadata
    rootNode.put("token", token)
    rootNode.put("polygon_hash", NDVIServlet.generatePolygonHash(geom))
    
    // Add available dates array
    val availableDatesArray = mapper.createArrayNode()
    val statisticsPerDateNode = mapper.createObjectNode()
    
    for (matchingRasterDir <- matchingRasterDirs) {
      val date = new Path(matchingRasterDir).getName
      availableDatesArray.add(date)
      
      // Generate basic statistics for each date (quick preview)
      try {
        val matchingFiles = RasterFileRDD.selectFiles(fileSystem, matchingRasterDir, geom)
        if (matchingFiles.nonEmpty) {
          // Quick statistics calculation without full image generation
          val resultsIterator = SingleMachineRaptorJoin.raptorJoin[Int](matchingFiles, Array(geom))
          if (resultsIterator != null) {
            // Convert Iterator to Array to avoid consumption issues
            val results = resultsIterator.toArray
            if (results.nonEmpty) {
              val nonZeroPixels = results.filter(x => x._2 != 0)
              val scaledValues = nonZeroPixels.map(x => (x._2.toFloat - 1.0f) * (2.0f / 254) - 1)
              
              if (scaledValues.nonEmpty) {
                val statsNode = mapper.createObjectNode()
                statsNode.put("min", scaledValues.min)
                statsNode.put("max", scaledValues.max)
                statsNode.put("mean", scaledValues.sum / scaledValues.length)
                statsNode.put("pixels", scaledValues.length)
                statisticsPerDateNode.set(date, statsNode)
              }
            }
          }
        }
      } catch {
        case e: Exception =>
          logInfo(s"Failed to generate statistics for date $date: ${e.getMessage}")
          // Continue with other dates even if one fails
      }
    }
    
    rootNode.set("available_dates", availableDatesArray)
    rootNode.set("statistics_per_date", statisticsPerDateNode)
    
    // Write response
    val out = response.getWriter
    val jsonString = mapper.writer.writeValueAsString(rootNode)
    out.print(jsonString)
    out.flush()
    
    logInfo(s"Image metadata generation took ${(System.nanoTime() - t1) * 1E-9} seconds")
    true
  }

  /**
   * Returns array of NDVI images as base64 for date range
   * @param path
   * @param request
   * @param response
   * @return
   */
  @WebMethod(url = "/ndvi/images.json", order = 3)
  def ndviImages(path: String, request: HttpServletRequest, response: HttpServletResponse): Boolean = {
    val t1 = System.nanoTime()
    
    // Get date range parameters
    var dateFrom = ""
    var dateTo = ""
    
    try {
      dateFrom = request.getParameter("from")
      dateTo = request.getParameter("to")
    } catch {
      case e: NullPointerException => throw new RuntimeException("Couldn't find the required parameters: from and to")
    }
    
    // Set response headers
    response.setContentType("application/json")
    response.setStatus(HttpServletResponse.SC_OK)
    
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
    
    // Find NDVI data for the date range
    val fileSystem = ndviDataPath.getFileSystem(sparkSession.sparkContext.hadoopConfiguration)
    val matchingRasterDirs: Array[String] = fileSystem.listStatus(ndviDataPath,
      (path: Path) => NDVIServlet.dateRangeOverlap(dateFrom, dateTo, path.getName))
      .map(_.getPath.toString)
      .sortBy(path => new Path(path).getName) // Sort by date
    
    logInfo(s"Found ${matchingRasterDirs.length} matching NDVI directories for date range $dateFrom to $dateTo")
    
    // Generate images for each date
    val imageResults = ArrayBuffer[(String, String)]() // (date, base64Image)
    
    for (matchingRasterDir <- matchingRasterDirs) {
      try {
        val date = new Path(matchingRasterDir).getName
        val matchingFiles = RasterFileRDD.selectFiles(fileSystem, matchingRasterDir, geom)
        
        if (matchingFiles.nonEmpty) {
          // Get pixel data using RaptorJoin
          val resultsIterator = SingleMachineRaptorJoin.raptorJoin[Int](matchingFiles, Array(geom))
          
          if (resultsIterator != null) {
            // Convert Iterator to Array to avoid consumption issues
            val results = resultsIterator.toArray
            
            if (results.nonEmpty) {
              // Filter and scale NDVI values
              val nonZeroPixels = results.filter(x => x._2 != 0)
              val scaledValues = nonZeroPixels.map(x => (x._2.toFloat - 1.0f) * (2.0f / 254) - 1)
              
              if (scaledValues.nonEmpty) {
                // Calculate optimal resolution based on polygon aspect ratio
                val envelope = geom.getEnvelopeInternal
                val widthDegrees = envelope.getWidth
                val heightDegrees = envelope.getHeight
                val aspectRatio = widthDegrees / heightDegrees
                
                // Set target resolution for longest dimension
                val maxResolution = 512
                val (imageWidth, imageHeight) = if (aspectRatio >= 1.0) {
                  // Width is longer - set width to maxResolution
                  (maxResolution, (maxResolution / aspectRatio).toInt)
                } else {
                  // Height is longer - set height to maxResolution  
                  ((maxResolution * aspectRatio).toInt, maxResolution)
                }
                
                logInfo(s"Image dimensions: ${imageWidth}x${imageHeight} (aspect ratio: ${aspectRatio})")
                
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
                  val sums = new Array[Float](imageWidth * imageHeight)
                  val counts = new Array[Int](imageWidth * imageHeight)
                  val imageMBR = Reprojector.reprojectEnvelope(geom.getEnvelopeInternal, 4326, 3857)
                  val imageMetadata = RasterMetadata.create(imageMBR.getMinX, imageMBR.getMaxY, imageMBR.getMaxX, imageMBR.getMinY,
                    3857, imageWidth, imageHeight, imageWidth, imageHeight)

                  val cachedTransformations: scala.collection.mutable.HashMap[RasterMetadata, MathTransform] =
                    scala.collection.mutable.HashMap.empty[RasterMetadata, MathTransform]

                  for (pixel <- pixels) {
                    if (pixel.m != 0) { // Only process non-zero NDVI pixels
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
                      val maxX: Int = imageWidth min (pixelMBR(0).round max pixelMBR(2).round max pixelMBR(4).round max pixelMBR(6).round).toInt
                      val minY: Int = 0 max (pixelMBR(1).round min pixelMBR(3).round min pixelMBR(5).round min pixelMBR(7).round).toInt
                      val maxY: Int = imageHeight min (pixelMBR(1).round max pixelMBR(3).round max pixelMBR(5).round max pixelMBR(7).round).toInt
                      for (y <- minY until maxY; x <- minX until maxX) {
                        val offset = y * imageWidth + x
                        // Scale NDVI value from [1, 255] to [-1, +1] for coloring
                        val ndviValue = (pixel.m.toFloat - 1.0f) * (2.0f / 254) - 1
                        sums(offset) += ndviValue
                        counts(offset) = counts(offset) + 1
                      }
                    }
                  }
                  
                  // Convert the array of values to an image using NDVI coloring
                  val averages = counts.zip(sums).map(x => if(x._1 == 0) Float.NaN else x._2 / x._1)
                  val targetImage = new BufferedImage(imageWidth, imageHeight, BufferedImage.TYPE_INT_ARGB)
                  for (offset <- averages.indices; if counts(offset) > 0) {
                    val x = offset % imageWidth
                    val y = offset / imageWidth
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
                  
                  // Convert image to base64
                  val imageBytes = new ByteArrayOutputStream()
                  ImageIO.write(targetImage, "png", imageBytes)
                  val base64Image = Base64.getEncoder.encodeToString(imageBytes.toByteArray)
                  imageBytes.close()
                  
                  imageResults.append((date, base64Image))
                  logInfo(s"Generated NDVI image for date $date with proper spatial mapping")
                } else {
                  logInfo(s"No spatial intersections found for date $date")
                }
              }
            }
          }
        }
      } catch {
        case e: Exception =>
          logError(s"Error generating NDVI image for date ${new Path(matchingRasterDir).getName}", e)
          // Continue with other dates even if one fails
      }
    }
    
    // Build JSON response
    val mapper = new ObjectMapper
    val rootNode = mapper.createObjectNode()
    rootNode.put("engine", "Beast")
    
    // Add query info
    val queryNode = mapper.createObjectNode()
    queryNode.put("from", dateFrom)
    queryNode.put("to", dateTo)
    rootNode.set("query", queryNode)
    
    // Add images array
    val imagesArray = mapper.createArrayNode()
    for ((date, base64Image) <- imageResults) {
      val imageNode = mapper.createObjectNode()
      imageNode.put("date", date)
      imageNode.put("image", base64Image)
      imagesArray.add(imageNode)
    }
    rootNode.set("images", imagesArray)
    
    // Write response
    val out = response.getWriter
    val jsonString = mapper.writer.writeValueAsString(rootNode)
    out.print(jsonString)
    out.flush()
    
    logInfo(s"NDVI images generation took ${(System.nanoTime() - t1) * 1E-9} seconds, generated ${imageResults.length} images")
    true
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
   * Convert NDVI value to RGB color for visualization
   * Uses red-yellow-green gradient based on vegetation health
   */
  def ndviToColor(ndvi: Float): Color = {
    val clampedNdvi = Math.max(-1.0f, Math.min(1.0f, ndvi))
    
    if (clampedNdvi < 0.2f) {
      // Poor vegetation (0 to 0.2): Red to Orange gradient
      val t = Math.max(0.0f, clampedNdvi) / 0.2f
      new Color(255, (t * 100).toInt, 0)
    } else if (clampedNdvi < 0.5f) {
      // Moderate vegetation (0.2 to 0.5): Orange to Yellow gradient
      val t = (clampedNdvi - 0.2f) / 0.3f
      new Color(255, (100 + t * 155).toInt, 0)
    } else {
      // Good to excellent vegetation (0.5 to 1): Yellow to Green gradient
      val t = (clampedNdvi - 0.5f) / 0.5f
      new Color((255 - t * 255).toInt, 255, 0)
    }
  }
}