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
For the Python part, you need Python 3.11 or later. You will need conda for environment management.
You also need gdal.

### Setup

This project expects all data files (shapefile, GeoTIFF) to be stored in the `data/` directory.
The data directory should be organized as follows:

![data directory](doc/images/directory_organization.png)

### ETMap dataset configuration

The ET Map functionality depends on several external datasets (NLDAS, elevation, land cover, soil). Before starting any WSGI or worker processes, configure these datasets and paths.

#### Configure base paths

All paths are centralized in `wsgi/app/et_map/etmap_modules/config.py`. By default they resolve relative to the repository root `REPO_ROOT`. If you deploy under a different root, adjust only here:

```python
DB_PATH        = os.path.join(REPO_ROOT, "etmap.db")
DATA_BASE_PATH = os.path.join(REPO_ROOT, "etmap_data")
RESULTS_BASE_PATH    = os.path.join(REPO_ROOT, "results")
```

Please ensure these configured directories have sufficient permissions for worker and API processes to modify them.

*Note*: `raw_data_modules.RawDataConfig` delegates to `ETMapConfig`. Configure paths only once in `etmap_modules/config.py`.

#### NLDAS

1. Login to `https://urs.earthdata.nasa.gov/home`.
2. Go to **Applications → Authorised Apps** and approve **NASA GESDISC DATA ARCHIVE**.

In a terminal:

```shell
printf "machine urs.earthdata.nasa.gov login <USER> password <PASS>\n" > ~/.netrc
chmod 600 ~/.netrc
touch ~/.urs_cookies
printf "HTTP.COOKIEJAR=$HOME/.urs_cookies\nHTTP.NETRC=$HOME/.netrc\n" > ~/.dodsrc
```

If issues occur, try adding:

```shell
export NETRC=$HOME/.netrc
```

#### Elevation

1. Go to `https://landfire.gov/topographic/elevation`.
2. Select **CONUS**.
3. Filter **Theme** as **Topographic**.
4. Download elevation data under the **Elevation – ELEV** section.

Folder structure:

```text
etmap_data/LF2020_Elev_220_CONUS/Tif/LC20_Elev_220.tif
```

#### NLCD

Go to `https://www.sciencebase.gov/catalog/item/6810c1a4d4be022940554075` and download the desired year NLCD data.

Folder structure:

```text
etmap_data/NLCD/Annual_NLCD_LndCov_{YEAR}_CU_C1V1/Annual_NLCD_LndCov_{YEAR}_CU_C1V1.tif
```

Examples:

- 2019:

  ```text
  etmap_data/NLCD/Annual_NLCD_LndCov_2019_CU_C1V1/Annual_NLCD_LndCov_2019_CU_C1V1.tif
  ```

- 2024:

  ```text
  etmap_data/NLCD/Annual_NLCD_LndCov_2024_CU_C1V1/Annual_NLCD_LndCov_2024_CU_C1V1.tif
  ```

Configuration update after downloading:

1. Open `wsgi/app/et_map/etmap_modules/config.py`.
2. Find the line `AVAILABLE_NLCD_YEARS = [2019, 2024]`.
3. Add your downloaded year to the list.

Example: if you download 2023 NLCD data, extract to:

```text
etmap_data/NLCD/Annual_NLCD_LndCov_2023_CU_C1V1/Annual_NLCD_LndCov_2023_CU_C1V1.tif
```

Then update config:

```python
AVAILABLE_NLCD_YEARS = [2019, 2024, 2023]
```

*Note*: You must update the config file each time you add new NLCD data, otherwise the system will not recognize the new year and will fall back to the closest available year.

#### SSURGO

1. Go to `https://www.sciencebase.gov/catalog/item/5fd7c19cd34e30b9123cb51f`.
2. Navigate to **Attached Files** and download `awc_gNATSGO.zip` and `fc_gNATSGO.zip`.

Folder structure:

```text
etmap_data/Soil_Data/awc_gNATSGO_US.tif
etmap_data/Soil_Data/fc_gNATSGO_US.tif
```

### Run in development
To run the server in development mode, run the class "`edu.ucr.cs.bdlab.beast.operations.Main`" with command line
argument `server -enableStaticFileHandling`. Open your browser and navigate to
(http://localhost:8890/public_html/index.html).

For the Python part, you should use a Conda/Mamba environment defined in `wsgi/environment.yml` and run a [Flask](https://flask.palletsprojects.com) server on it.
```shell
# Create a Conda/Mamba environment from the provided specification
# (this will create an environment named "ffnenv")
conda env create -f wsgi/environment.yml
# or, with mamba
# mamba env create -f wsgi/environment.yml

# Activate the environment
conda activate ffnenv
# or
# mamba activate ffnenv

# Start a Python server that runs the WSGI scripts
flask --debug --app wsgi/server.py run
# When you're done, deactivate the environment
conda deactivate
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
3. Create a Python environment in that directory to use for the Python server based on the provided Conda environment specification.
    ```shell
    cd /var/www/ffn.example.com
    # Copy the environment specification
    cp /path/to/local/checkout/wsgi/environment.yml wsgi/environment.yml

    # Create the Conda/Mamba environment (this will create an environment named "ffnenv")
    conda env create -f wsgi/environment.yml
    # or, with mamba
    # mamba env create -f wsgi/environment.yml

    # Activate the environment
    conda activate ffnenv
    # or
    # mamba activate ffnenv
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
    1. In the directory `/var/www/ffn.example.com` where you have the Python environment, install the required module.
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

      Example systemd unit using Gunicorn (alternative to `mod_wsgi-express`):

      ```ini
      [Unit]
      Description=FutureFarmNow WSGI server (Gunicorn)
      After=network.target

      [Service]
      Type=simple
      User=your_user
      Group=your_group
      WorkingDirectory=/path/to/server
      Environment="PATH=/path/to/miniconda/envs/ffnenv/bin"
      ExecStart=/path/to/miniconda/envs/ffnenv/bin/gunicorn \
          --workers 4 \
          --threads 15 \
          --bind 127.0.0.1:8082 \
          --access-logfile wsgilog/access.log \
          --error-logfile wsgilog/error.log \
          wsgi.wsgi:application
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

9. Optional: Configure an ET Map worker process. Required for ETMap feature. 

   The ET Map algorithm fetches and processes multiple datasets (e.g., NLDAS, Landsat, PRISM) in the background. For production deployments, you should run a separate long-lived worker process that continuously polls for ET Map jobs and performs the heavy processing work.

   - **User/Group**: Set the `User` and `Group` to an account with access to your data and environment.
   - **WorkingDirectory**: Point to the directory where your WSGI application and data live (for example, `/var/www/sites/ffn.example.com`).
   - **Environment**: Ensure that your worker process activates the same Conda/Mamba environment defined by `wsgi/environment.yml` (e.g., by sourcing `conda.sh` and calling `conda activate ffnenv` before running `python -m wsgi.app.et_map.worker`).
   - **Cloud vs. on‑prem**: On cloud platforms, you can model the same behavior with a containerized worker (e.g., a long‑running Kubernetes Deployment, ECS service, or similar) that runs the ET worker module on startup. On on‑premise servers, a systemd service or equivalent init system is recommended.

   The important requirement is that the worker process:

   - Runs under a properly configured Python environment created from `wsgi/environment.yml`.
   - Has access to the same data directories as the WSGI/API server.
   - Is configured to restart on failure according to your operational policies.

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