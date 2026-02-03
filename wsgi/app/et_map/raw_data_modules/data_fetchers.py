import os
import json
import glob
import time
import tempfile
import shutil
import zipfile
import requests
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
from typing import Optional, Dict
from pystac_client import Client
import planetary_computer
import rasterio
from shapely.geometry import shape, mapping
import numpy as np
import xarray as xr
from rasterio.transform import from_bounds
from netrc import netrc
from .config import RawDataConfig

class BaseFetcher(ABC):
    """Abstract base class for data fetchers"""

    @abstractmethod
    def fetch_data(self, date_from: str, date_to: str, geometry_json: str = None) -> bool:
        pass

class LandsatFetcher(BaseFetcher):
    def fetch_data(self, date_from: str, date_to: str, geometry_json: str = None) -> bool:
        try:
            print("Fetching raw Landsat data (full scenes, no clipping)...")
            RawDataConfig.ensure_directories()

            aoi_geom = None
            if geometry_json:
                try:
                    aoi_geom = shape(json.loads(geometry_json))
                except Exception as e:
                    print(f"Warning: Could not parse geometry; searching without AOI filter: {e}")

            catalog = Client.open(
                "https://planetarycomputer.microsoft.com/api/stac/v1",
                modifier=planetary_computer.sign_inplace
            )

            nearest_window = getattr(RawDataConfig, "LANDSAT_NEAREST_DAY_WINDOW", 45)
            start = datetime.fromisoformat(date_from).date()
            end = datetime.fromisoformat(date_to).date()
            cur = start

            while cur <= end:
                date_str = cur.isoformat()

                # Exact date on server -> download ALL intersecting scenes
                items = self._search_server_for_date(catalog, date_str, aoi_geom)
                print(f"{date_str}: Found {len(items)} Landsat scenes on server")

                if items:
                    self._download_all_from_items(items, date_str)
                else:
                    # Nearest-date on server (window, tie -> newer) -> download ALL for that date
                    used_date = self._fetch_nearest_on_server(
                        catalog=catalog,
                        target_date=cur,
                        area_of_interest=aoi_geom,
                        window_days=nearest_window
                    )
                    if used_date:
                        print(f"   Using nearest server date {used_date} for requested {date_str}")
                    else:
                        print(f"   No server scenes within +/-{nearest_window} days of {date_str}")

                cur += timedelta(days=1)

            print(" Landsat data collection completed")
            return True

        except Exception as e:
            print(f" Error in Landsat collection: {e}")
            return False

    # Server search & download
    def _search_server_for_date(self, catalog, date_string: str, aoi_geom) -> list:
        """Query the server for a single day window, filtering out Landsat 7 (SLC issues)"""
        time_window = f"{date_string}T00:00:00Z/{date_string}T23:59:59Z"
        params = {
            "collections": [RawDataConfig.LANDSAT_COLLECTION],
            "datetime": time_window,
            "limit": RawDataConfig.MAX_LANDSAT_SCENES
        }
        if aoi_geom is not None:
            params["intersects"] = mapping(aoi_geom)

        search = catalog.search(**params)
        items = list(search.items()) if hasattr(search, 'items') else list(search.get_items())

        # Filter out Landsat 7 (LE07) scenes - they have SLC failure issues since 2003
        filtered_items = [item for item in items if not item.id.startswith('LE07')]
        if len(filtered_items) < len(items):
            print(f"   Filtered out {len(items) - len(filtered_items)} Landsat 7 scenes (SLC issues)")

        return filtered_items

    def _download_all_from_items(self, items: list, label_date_str: str) -> None:
        """
        Download B4/B5 for every item in 'items' (no early stop).
        Skips files that already exist by filename.
        """
        for item in items:
            scene_id = item.id
            item_date_string = item.datetime.date().isoformat()

            if 'red' in item.assets:
                self._download_band(item, 'red', 'B4', scene_id, item_date_string, RawDataConfig.LANDSAT_B4_DIR)
            if 'nir08' in item.assets:
                self._download_band(item, 'nir08', 'B5', scene_id, item_date_string, RawDataConfig.LANDSAT_B5_DIR)

    def _fetch_nearest_on_server(self, catalog, target_date, area_of_interest, window_days: int) -> Optional[str]:
        """
        Search server +/-window_days for nearest date with scenes.
        Order: +1, -1, +2, -2, ... (tie -> newer).
        When found, download ALL intersecting scenes for that date. Return the used date.
        """
        for d in range(1, window_days + 1):
            plus_date = (target_date + timedelta(days=d)).isoformat()
            items = self._search_server_for_date(catalog, plus_date, area_of_interest)
            if items:
                print(f"   Nearest server date chosen: {plus_date} (offset +{d} days)")
                self._download_all_from_items(items, plus_date)
                return plus_date

            minus_date = (target_date - timedelta(days=d)).isoformat()
            items = self._search_server_for_date(catalog, minus_date, area_of_interest)
            if items:
                print(f"   Nearest server date chosen: {minus_date} (offset -{d} days)")
                self._download_all_from_items(items, minus_date)
                return minus_date

        return None

    def _download_band(self, item, asset_key: str, band_name: str, scene_id: str, date_string: str, output_dir: str):
        """Download individual band"""
        try:
            os.makedirs(output_dir, exist_ok=True)
            filename = f"{band_name}_{scene_id}_{date_string}.tif"
            output_path = os.path.join(output_dir, filename)

            if os.path.exists(output_path):
                print(f"   {filename} already exists, skipping")
                return

            asset_href = planetary_computer.sign_url(item.assets[asset_key].href)
            with rasterio.open(asset_href) as src:
                full_data = src.read()
                profile = src.profile.copy()

                tmp_path = output_path + ".part"
                with rasterio.open(tmp_path, 'w', **profile) as dst:
                    dst.write(full_data)
                os.replace(tmp_path, output_path)

                print(f"   Saved raw {band_name} (full scene): {filename}")
                print(f"    Shape: {src.width} x {src.height}, CRS: {src.crs}")
        except Exception as e:
            print(f"   Error downloading {band_name} for {scene_id}: {e}")

class PRISMFetcher(BaseFetcher):
    def fetch_data(self, date_from: str, date_to: str, geometry_json: str = None) -> bool:
        try:
            print("Fetching raw PRISM data...")
            RawDataConfig.ensure_directories()

            current_date = datetime.fromisoformat(date_from)
            end_date = datetime.fromisoformat(date_to)

            while current_date <= end_date:
                year_month_day = current_date.strftime('%Y%m%d')
                date_folder = os.path.join(RawDataConfig.PRISM_DIR, current_date.strftime('%Y-%m-%d'))
                os.makedirs(date_folder, exist_ok=True)

                print(f"Processing date: {current_date.strftime('%Y-%m-%d')}")

                for variable in RawDataConfig.PRISM_VARIABLES:
                    output_path = os.path.join(date_folder, f"prism_{variable}_{year_month_day}.tif")

                    if os.path.exists(output_path):
                        print(f"   {variable} already exists, skipping")
                        continue

                    url = f"{RawDataConfig.PRISM_BASE_URL}/{variable}/{year_month_day}"

                    try:
                        self._download_prism_variable(url, output_path, variable, year_month_day)
                        print(f"   Saved raw PRISM {variable} for {year_month_day}")

                    except Exception as e:
                        print(f"   Error downloading PRISM {variable} for {year_month_day}: {e}")
                        continue

                current_date += timedelta(days=1)

            print(f" PRISM data collection completed")
            return True

        except Exception as e:
            print(f" Error in PRISM collection: {e}")
            return False

    def _download_prism_variable(self, url: str, output_path: str, variable: str, date_str: str):
        response = requests.get(url, stream=True, timeout=RawDataConfig.DOWNLOAD_TIMEOUT)
        response.raise_for_status()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_file = os.path.join(temp_dir, f"{variable}_{date_str}")

            with open(temp_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            # Handle zip files
            content_type = response.headers.get('Content-Type', '')
            if 'zip' in content_type or open(temp_file, 'rb').read(4) == b'PK\x03\x04':
                with zipfile.ZipFile(temp_file) as zip_file:
                    zip_file.extractall(temp_dir)
                tif_files = [f for f in os.listdir(temp_dir) if f.lower().endswith('.tif')]
                if tif_files:
                    temp_file = os.path.join(temp_dir, tif_files[0])

            shutil.copy2(temp_file, output_path)

class NLDASFetcher(BaseFetcher):
    def __init__(self):
        self.session = None

    def fetch_data(self, date_from: str, date_to: str, geometry_json: str = None) -> bool:
        try:
            print("Fetching raw NLDAS data...")

            start = datetime.fromisoformat(date_from)
            end = datetime.fromisoformat(date_to)

            print(f"Date range: {start.date()} -> {end.date()} (inclusive)")

            self.session = self._earthdata_session()

            dt = start
            while dt <= end:
                year = dt.year
                nldas_year_dir = RawDataConfig.get_nldas_dir(year)
                out_day_dir = self._ensure_day_dir(nldas_year_dir, dt)

                if self._day_complete(nldas_year_dir, dt):
                    print(f" {dt.date()} already complete (24 files). Skipping.")
                    dt += timedelta(days=1)
                    continue

                print(f"Processing date: {dt.strftime('%Y-%m-%d')}")

                for hh in range(24):
                    ts = dt.replace(hour=hh, minute=0, second=0, microsecond=0)
                    out_name = f"NLDAS_FORA_{ts.strftime('%Y%m%d_%H')}00.tif"
                    out_path = os.path.join(out_day_dir, out_name)

                    if os.path.exists(out_path):
                        continue

                    url = self._nldas_hourly_https_url(ts)
                    try:
                        nc_path = self._download_hour_nc(url)
                        with xr.open_dataset(nc_path, engine="netcdf4") as ds:
                            stack, transform, ny, nx = self._extract_arrays(ds)
                        self._write_geotiff(out_path, stack, transform, ny, nx)
                        print(f"   {ts.strftime('%H:00')} -> {out_name}")
                    except Exception as e:
                        print(f"   FAILED {ts.strftime('%H:00')} - {e}")
                    finally:
                        if 'nc_path' in locals() and os.path.exists(nc_path):
                            try:
                                os.remove(nc_path)
                            except Exception:
                                pass

                    if RawDataConfig.THROTTLE_SECONDS > 0:
                        time.sleep(RawDataConfig.THROTTLE_SECONDS)

                dt += timedelta(days=1)

            print(f" NLDAS data collection completed")
            return True

        except Exception as e:
            print(f" Error in NLDAS collection: {e}")
            return False

    def _nldas_hourly_https_url(self, dt: datetime) -> str:
        doy = dt.timetuple().tm_yday
        return (
            f"{RawDataConfig.NLDAS_BASE_URL}/"
            f"{dt:%Y}/{doy:03d}/NLDAS_FORA0125_H.A{dt:%Y%m%d}.{dt:%H}00.020.nc"
        )

    def _earthdata_session(self):
        """Create authenticated session"""
        try:
            login, _, password = netrc().authenticators("urs.earthdata.nasa.gov")
        except Exception:
            raise RuntimeError("Could not read URS creds from ~/.netrc")
        s = requests.Session()
        s.auth = (login, password)
        s.headers.update({"User-Agent": "nldas-fetch/1.0"})
        s.max_redirects = 10
        return s

    def _download_hour_nc(self, url: str) -> str:
        """Download hourly NetCDF"""
        attempt, last_err = 0, None
        while attempt <= RawDataConfig.MAX_RETRIES:
            try:
                r = self.session.get(url, stream=True, allow_redirects=True,
                                   timeout=RawDataConfig.DOWNLOAD_TIMEOUT)
                if r.status_code in (401, 403):
                    raise RuntimeError(f"HTTP {r.status_code} - check ~/.netrc")
                r.raise_for_status()

                ctype = r.headers.get("Content-Type", "").lower()
                if "text/html" in ctype:
                    head = r.iter_content(4096).__next__().decode("utf-8", errors="ignore")
                    raise RuntimeError(f"Got HTML instead of NetCDF - likely auth issue")

                fd, tmp_path = tempfile.mkstemp(prefix="nldas_", suffix=".nc")
                with os.fdopen(fd, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
                return tmp_path
            except Exception as e:
                last_err = e
                attempt += 1
                if attempt > RawDataConfig.MAX_RETRIES:
                    break
                backoff = min(5 * attempt, 30)
                print(f"  ! Retry {attempt}/{RawDataConfig.MAX_RETRIES} in {backoff}s - {e}")
                time.sleep(backoff)
        raise RuntimeError(f"Failed to download {url}: {last_err}")

    def _extract_arrays(self, ds):
        if "time" in getattr(ds, "dims", {}) and getattr(ds, "sizes", {}).get("time", 1) == 1:
            ds = ds.isel(time=0)

        def pick_var(candidates):
            for n in candidates:
                if n in ds.variables:
                    return ds[n]
            try:
                avail = list(ds.data_vars)
            except Exception:
                avail = list(ds.variables)
            raise KeyError(f"None of {candidates} found. Available: {avail}")

        Tair  = pick_var(["Tair",  "Tair_f_inst", "tmp2m", "TMP_2maboveground", "temperature"])
        Qair  = pick_var(["Qair",  "Qair_f_inst", "spfh2m", "SPFH_2maboveground", "specific_humidity"])
        PSurf = pick_var(["PSurf", "PSurf_f_inst","pressfc","PRES_surface","pressure"])
        U     = pick_var(["Wind_E","ugrd10m","UGRD_10maboveground","wind_u"])
        V     = pick_var(["Wind_N","vgrd10m","VGRD_10maboveground","wind_v"])
        SW    = pick_var(["SWdown","SWdown_f_inst","SWdown_f_tavg","dswrf","DSWRF_surface","shortwave_radiation"])

        def _get_lat_lon(_ds):
            for lat_key in ["lat","latitude","Lat","Latitude","y"]:
                if lat_key in _ds.variables or lat_key in _ds.coords:
                    lat = (_ds[lat_key].values if lat_key in _ds.variables else _ds.coords[lat_key].values)
                    break
            else:
                raise KeyError(f"No latitude coordinate found")
            for lon_key in ["lon","longitude","Lon","Longitude","x"]:
                if lon_key in _ds.variables or lon_key in _ds.coords:
                    lon = (_ds[lon_key].values if lon_key in _ds.variables else _ds.coords[lon_key].values)
                    break
            else:
                raise KeyError(f"No longitude coordinate found")
            return lat, lon

        lat, lon = _get_lat_lon(ds)

        arrs = []
        for da in [Tair, Qair, PSurf, U, V, SW]:
            a = da.values
            if a.ndim == 3:
                a = a[0]
            if lat[0] < lat[-1]:
                a = a[::-1, :]
            arrs.append(a.astype("float32"))

        ny, nx = arrs[0].shape
        dx = float(abs(lon[1] - lon[0])) if getattr(lon, "ndim", 1) == 1 else 0.125
        dy = float(abs(lat[1] - lat[0])) if getattr(lat, "ndim", 1) == 1 else 0.125
        xmin = float(lon.min() - dx/2); xmax = float(lon.max() + dx/2)
        ymin = float(min(lat[0], lat[-1]) - dy/2)
        ymax = float(max(lat[0], lat[-1]) + dy/2)

        transform = from_bounds(xmin, ymin, xmax, ymax, nx, ny)
        stack = np.stack(arrs, axis=0)
        return stack, transform, ny, nx

    def _ensure_day_dir(self, root: str, dt: datetime) -> str:
        """Create day directory"""
        day_dir = os.path.join(root, dt.strftime("%Y-%m-%d"))
        os.makedirs(day_dir, exist_ok=True)
        return day_dir

    def _day_complete(self, root: str, dt: datetime) -> bool:
        """Check if day is complete"""
        day_dir = os.path.join(root, dt.strftime("%Y-%m-%d"))
        if not os.path.isdir(day_dir):
            return False
        return len([f for f in os.listdir(day_dir) if f.lower().endswith(".tif")]) >= 24

    def _write_geotiff(self, path, stack, transform, ny, nx):
        """Write GeoTIFF"""
        profile = {
            "driver": "GTiff",
            "height": ny,
            "width": nx,
            "count": 6,
            "dtype": "float32",
            "crs": "EPSG:4326",
            "transform": transform,
            "tiled": True,
            "compress": "deflate",
            "predictor": 2,
            "BIGTIFF": "YES",
        }
        with rasterio.open(path, "w", **profile) as dst:
            dst.write(stack)
            dst.set_band_description(1, "Tair_K")
            dst.set_band_description(2, "Qair_kg_per_kg")
            dst.set_band_description(3, "PSurf_Pa")
            dst.set_band_description(4, "Wind_E_mps")
            dst.set_band_description(5, "Wind_N_mps")
            dst.set_band_description(6, "SWdown_Wm2")
