# soil-salinity

This project combines California farmland vector data and satellite soil salinity data and displays the result in an interactive web interface.

## Features

- Aggregation function selection (minimum, maximum, average, standard deviation)
- Raster data selection
- Interactive farmland data front-end interface
- Dynamic extents

## Installation

### Dependencies

The soil salinity backend relies upon Java 1.8.0 and Scala 2.12.7.
For the Python part, you need Python 3.11 or later.
You also need gdal.

### Setup

This project expects all data files (shapefile, GeoTIFF) to be stored in the `data/` directory.
The data directory should be organized as follows:

![data directory](doc/images/directory_organization.png)

### Run in development
To run the server in development mode, run the class "`edu.ucr.cs.bdlab.beast.operations.Main`" with command line
argument `server -enableStaticFileHandling`. Open your browser and navigate to
(http://localhost:8890/public_html/index.html).

For the Python part, you need to create a virtual environment and run a [Flask](https://flask.palletsprojects.com) server on it.
```shell
# Create a virtual environment
python3 -m venv ffnenv
# Activate the virtual environment
source ffnenv/bin/activate # or ffn-env\Scripts\activate
# Install required packages in the virtual environment
pip install pandas numpy geopandas shapely pyproj rasterio scikit-learn scipy pysal esda libpysal pyDOE3 pykrige tqdm flask gdal
# Start a Python server that runs the WSGI scripts
flask --debug --app wsgi/server.py run
# When you're done, deactivate the virtual environment
deactivate
```

To test soil sample function, navigate to (http://127.0.0.1:5000/public_html/soil_sample.html)

### Server deployment
1. Install Apache web server and required libraries to host the application.
    ```shell
    sudo apt install apache2 libgdal-dev gdal-bin apache2-dev -y
    pip install mod_wsgi
    ```
2. Create a directory to host the application and assign it to the right owner and group.
    ```shell
    sudo mkdir /var/www/ffn.example.com
    sudo chown user:www-data /var/www/ffn.example.com
    ```
   This creates a directory and assign your `user` as the owner and `www-data`, i.e., Apache, as the group.
3. Create a Python virtual environment in that directory to use for the Python server.
    ```shell
    cd /var/www/ffn.example.com
    # Create a virtual environment
    python3 -m venv ffnenv
    # Activate the virtual environment
    source ffnenv/bin/activate
    # Install required packages in the virtual environment
    pip install pandas numpy geopandas shapely pyproj rasterio scikit-learn scipy pysal esda libpysal pyDOE3 pykrige tqdm flask osgeo
    ```
4. Copy the static HTML files and code to the server.
    ```shell
    rsync -av --exclude=__pycache__ public_html/ remote_host:/var/www/ffn.example.com/public_html
    rsync -av --exclude=__pycache__ wsgi/ remote_host:/var/www/ffn.example.com/wsgi
    ```
    Place the `data/` on the server at which you want it to be hosted.
    Install Beast CLI and run the following command at the same directory where you have
    the `data` directory (not inside the `data` directory).
5. Start the Java server
    1. Make sure that you have [Spark](https://spark.apache.org) and
       [Beast CLI](https://bitbucket.org/bdlabucr/beast/src/aac8c00fd58f5c4dcbccdfa60ec5b6ba6bf00199/doc/Home.md) installed.
    2. Create a directory at the server to host the data. This should be on a drive with large capacity to hold the data.
        ```shell
        SERVER_DIR=/path/to/server
        mkdir -p $SERVER_DIR
        chgrp -R www-data $SERVER_DIR
        chmod g+rX $SERVER_DIR
        setfacl -m g:www-data:rX $SERVER_DIR
        ``` 
    3. Create the JAR file and copy to the server.
        ```shell
        mvn package
        scp target/futurefarmnow-backend-*.jar remote_host:/var/www/ffn.example.com/
        ```
        ```shell
        beast --jars futurefarmnow-backend-*.jar server
        ```

        In the directory where you run `beast server`, you can place a file `beast.properties` to set the default
        system parameters, e.g., `port:8080`.
   4. Configure Apache to forward the requests to the Java server. In your site configuration inside the `<VirtualHost>`
      section, add the following configuration.
      ```
      RewriteCond %{REQUEST_FILENAME}  ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$
      RewriteRule ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$ http://localhost:8080/$2 [P,L]
      ```

6. Start the WSGI server.
    1. In the directory `/var/www/ffn.example.com` where you have the virtual environment, install the required module.
        ```shell
        pip install mod_wsgi
        sudo mod_wsgi-express install # or mod_wsgi-express module-config > /etc/httpd/conf.modules.d/10-wsgi.conf
        ```
    2. Option A: Run within Apache. Add the following configuration in your site configuration in your <VirtualHost>.
       ```
       RewriteEngine On
       # You can either list all 
       RewriteCond %{REQUEST_URI}  ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/soil/sample.json$
       RewriteRule ^(.*)$ /wsgi/soil/sample.json [PT,L]

       WSGIDaemonProcess ffn python-home=/var/www/sites/ffn.example.com/ffnenv threads=5
       WSGIProcessGroup ffn
       WSGIApplicationGroup %{GLOBAL}
       WSGIScriptAlias /wsgi /var/www/sites/ffn.example.com/wsgi/wsgi.py

       <Directory /var/www/sites/ffn.example.com/wsgi/>
           Require all granted
       </Directory>
       ```
    3. Option B: Run as a standalone server.
       ```shell
       mod_wsgi-express start-server wsgi/wsgi.py --rotate-logs --log-directory wsgilog --port 8081 --threads 15
       ```
       Add the following configuration to your Apache server:
       ```
       RewriteCond %{REQUEST_URI}  ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/soil/sample.json$
       RewriteRule ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$ http://127.0.0.1:8082/$2 [P,L]
       ```
    
7. Full Apache server configuration.
    Create the file `/etc/apache2/sites-available/ffn.example.com.conf`.

    ```
    <VirtualHost *:80>
        ServerName ffn.example.com
        DocumentRoot /var/www/ffn.example.com/public_html

        # Serve static files from public_html
        Alias /static /var/www/ffn.example.com/public_html

        RewriteEngine On
        RewriteCond %{REQUEST_URI}  ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(soil/sample.json|ndvi/singlepolygon.json)$
        RewriteRule ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$ http://127.0.0.1:8082/$2 [P,L]
        RewriteCond %{REQUEST_FILENAME}  ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$
        RewriteRule ^/futurefarmnow-backend-[\.0-9]*(-[\w\d]+)?/(.*)$ http://localhost:8890/$2 [P,L]
    </VirtualHost>
    ```

7. Enable the site and restart Apache.
    ```shell
    sudo a2ensite ffn.example.com
    sudo systemctl reload apache2
    ```
8. Optional: Set the servers to start as service, e.g., with system startup. Requires root access.
   1. Create a file `/etc/systemd/system/ffn-java.service` with the following contents.
      ```
      [Unit]
      Description=FutureFarmNow Java server
      After=network.target

      [Service]
      Type=simple
      User=your_user
      Group=your_group
      WorkingDirectory=/path/to/server
      ExecStart=/bin/bash -lc 'beast --jars futurefarmnow-backend-*.jar server'
      Restart=on-failure
      
      [Install]
      WantedBy=multi-user.target
      ```
   2. Create another file for the WSGI service, `/etc/systemd/system/ffn-wsgi.service`:
      ```
      [Unit]
      Description=FutureFarmNow WSGI server
      After=network.target

      [Service]
      Type=simple
      User=your_user
      Group=your_group
      WorkingDirectory=/var/www/sites/ffn.example.com
      ExecStart=/bin/bash -lc '/var/www/sites/ffn.example.com/ffnenv/bin/mod_wsgi-express start-server wsgi/wsgi.py --rotate-logs --log-directory wsgilog --port 8082 --threads 15'
      Restart=on-failure
      
      [Install]
      WantedBy=multi-user.target
      ```
   3. Install the new service, enable, and start it.
      ```shell
      sudo systemctl daemon-reload # Install the service
      sudo systemctl enable ffn-java ffn-wsgi
      sudo systemctl start ffn-java ffn-wsgi
      ```

## Client Deployment (Next.js Application)

The Next.js client provides a modern web interface for the FutureFarmNow platform. Follow these steps to deploy it as static files.

### Prerequisites

- **Node.js 18.17 or later** - [Download](https://nodejs.org/)
- **npm 9 or later** (comes with Node.js)
- Access to your web server directory

### Local Development Setup

1. **Navigate to the client directory**
   ```bash
   cd ffn-nextjs-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your backend API URL
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Deployment

1. **Build the application for static export**
   ```bash
   cd ffn-nextjs-app
   npm run build
   ```

2. **Deploy static files to server**
   ```bash   
   # using scp for remote deployment
   scp -r out/* user@server:/var/www/sites/raptor.cs.ucr.edu/public_html/
   ```

**Note:** The application is configured for static deployment and will work with any web server that can serve static files. No additional web server configuration is required as the Next.js build process creates all necessary static assets.


### Configuration

#### Environment Variables

Create a `.env.local` file in the `ffn-nextjs-app` directory:

```bash
# Backend API Configuration
NEXT_PUBLIC_API_BASE_URL=https://ffn.example.com/futurefarmnow-backend-0.3-RC1

# Optional: For development with local backend
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8890
```

#### API Proxy Configuration

The Next.js application includes API proxy routes to handle CORS issues. These routes are automatically configured to forward requests to your backend server specified in `NEXT_PUBLIC_API_BASE_URL`.

### Troubleshooting

1. **CORS Issues**
   - The app uses API proxy routes to handle CORS
   - Ensure your `NEXT_PUBLIC_API_BASE_URL` is correctly configured

2. **Build Errors**
   - Run `npm run type-check` to identify TypeScript issues
   - Run `npm run lint` to check for code quality issues

3. **Map Loading Issues**
   - Check your internet connection for tile loading
   - Verify Leaflet CSS is properly imported

4. **API Connection Issues**
   - Verify backend services are running (Java server on port 8890, WSGI on port 8082)
   - Check environment variable configuration
   - Test API endpoints directly: `curl https://ffn.example.com/futurefarmnow-backend-0.3-RC1/soil/stats.json`

### API
Check the detailed [API description here](doc/api.md).

### Add vector dataset
Check the [step-by-step instructions for adding a new vector dataset](doc/add-vector-dataset.md).

## License

Copyright 2025 University of California, Riverside

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.