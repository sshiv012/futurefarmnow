import numpy as np
import math
from typing import Dict, Optional


class BAITSSSConstants:
    """Constants for BAITSSS ET model"""

    # Moisture / canopy parameters
    MAD = 0.4
    NDVImin = 0.15
    NDVImax = 0.85
    fc_min = 0.01
    fc_max = 1.0
    fc_full_veg = 0.8

    # Radiation / emissivity / albedo
    Albedo_soil = 0.2
    Albedo_veg = 0.15
    Emiss_soil = 0.98
    Emiss_veg = 0.98
    BB_Emissi = (Emiss_soil + Emiss_veg) / 2.0
    Stefan_Boltzamn = 0.0000000568

    # Aerodynamics / resistances
    rb = 25.0
    rahlo = 1.0
    rahhi = 200.0
    u_fri_lo = 0.01
    u_fri_hi = 500.0
    Zos = 0.01
    z_b_wind = 10.0
    z_b_air = 2.0

    # Temperature / flux bounds
    tslo = 270.0
    tshi = 335.0
    shlo = -500.0
    shhi = 500.0
    ghlo = -200.0
    ghhi = 300.0
    iter_lo = -1.0
    iter_hi = 1.0

    # Soil / water parameters
    Soillo = 0.01
    Soilhi = 1.0
    soilm_min = 0.0
    Theta_sat = 0.40
    soil_depth = 100.0
    droot = 500.0
    ssrun = 0.0

    # Reference ET and limits
    Ref_ET = 1.5 / 3600.0
    Ref_fac = 20.0
    ET_min = 0.000003
    rl_max = 5000.0

    # Meteorology / misc
    Cp = 1013.0
    Rgl = 100.0
    hs = 36.25
    time_step = 60.0
    Irri_flag = 1



class BAITSSSAlgorithm:

    def __init__(self):
        self.constants = BAITSSSConstants()

    def iterative_calculation(self, ndvi_in: float, lai_in: float, soil_awc_in: float,
                            soil_fc_in: float, nlcd_u_in: float, precip_in: float,
                            elev_array_in: float, tair_oc_in: float, s_hum_in: float,
                            uz_in_in: float, in_short_in: float, et_sum_in: float,
                            precip_prism_sum_in: float, irri_sum_in: float,
                            soilm_pre_in: float, soilm_root_pre_in: float) -> np.ndarray:
        """
        Single pixel calculation
        """
        block_vars = {
            'ndvi': np.array([[ndvi_in]], dtype=np.float32),
            'lai': np.array([[lai_in]], dtype=np.float32),
            'soil_awc': np.array([[soil_awc_in]], dtype=np.float32),
            'soil_fc': np.array([[soil_fc_in]], dtype=np.float32),
            'nlcd': np.array([[nlcd_u_in]], dtype=np.float32),
            'precipitation': np.array([[precip_in]], dtype=np.float32),
            'elevation': np.array([[elev_array_in]], dtype=np.float32),
            'temperature': np.array([[tair_oc_in]], dtype=np.float32),
            'humidity': np.array([[s_hum_in]], dtype=np.float32),
            'wind_speed': np.array([[uz_in_in]], dtype=np.float32),
            'radiation': np.array([[in_short_in]], dtype=np.float32),
            'soil_moisture_surface_prev': np.array([[soilm_pre_in]], dtype=np.float32),
            'soil_moisture_root_prev': np.array([[soilm_root_pre_in]], dtype=np.float32)
        }

        result = self.process_block(block_vars, 1, 1)

        if result is not None:
            return np.array([
                result['et_hour'][0, 0],
                result['precip_hour'][0, 0] if 'precip_hour' in result else precip_in,
                result['irrigation'][0, 0],
                result['soil_surface'][0, 0],
                result['soil_root'][0, 0]
            ], dtype=np.float32)
        else:
            return np.array([0.0, 0.0, 0.0, 0.2, 0.3], dtype=np.float32)

    def process_block(self, block_vars: Dict[str, np.ndarray],
                     block_height: int, block_width: int) -> Optional[Dict[str, np.ndarray]]:

        try:
            variables = self._extract_and_validate_variables(block_vars, block_height, block_width)

            results = self._run_complete_baitsss_physics(variables, block_height, block_width)

            return results

        except Exception as e:
            print(f"BAITSSS block processing error: {e}")
            return self._get_default_results(block_height, block_width)

    def _extract_and_validate_variables(self, block_vars: Dict[str, np.ndarray],
                                    block_height: int, block_width: int) -> Dict[str, np.ndarray]:

        variable_mapping = {
            'soil_awc': 'soil_awc',
            'soil_fc': 'soil_fc',
            'elevation': 'elevation',
            'nlcd': 'nlcd',
            'precipitation': 'precipitation',
            'ndvi': 'ndvi',
            'lai': 'lai',
            'temperature': 'temperature',
            'humidity': 'humidity',
            'wind_speed': 'wind_speed',
            'radiation': 'radiation',
            'soil_moisture_surface_prev': 'soil_moisture_surface_prev',
            'soil_moisture_root_prev': 'soil_moisture_root_prev'
        }

        # Defaults
        defaults = {
            'soil_awc': 0.15,
            'soil_fc': 35.0,
            'elevation': 200.0,
            'nlcd': 42.0,
            'precipitation': 0.0,
            'ndvi': 0.4,
            'lai': 3.0,
            'temperature': 15.0,
            'humidity': 0.65,
            'wind_speed': 3.0,
            'radiation': 400.0,
            'soil_moisture_surface_prev': 0.2,
            'soil_moisture_root_prev': 0.3
        }

        variables: Dict[str, np.ndarray] = {}
        for src_name, dst_name in variable_mapping.items():
            if src_name in block_vars:
                arr = block_vars[src_name].astype(np.float32)
                if arr.shape != (block_height, block_width):
                    arr = np.full((block_height, block_width), np.nan, dtype=np.float32)
            else:
                arr = np.full((block_height, block_width), defaults[dst_name], dtype=np.float32)
            variables[dst_name] = arr

        # Temperature
        if np.nanmedian(variables['temperature']) > 100.0:
            variables['temperature'] = variables['temperature'] - 273.15

        # Humidity normalization:
        hum = variables['humidity']
        if np.nanmax(hum) < 0.2:
            T = variables['temperature']
            elev = variables['elevation']
            # Pressure (kPa) as function of elevation (m)
            pressure = 101.3 * np.power(((293.0 - elev * 0.0065) / 293.0), 5.26)
            # Saturation vapor pressure es (kPa)
            es = 0.611 * np.exp((17.27 * T) / (T + 237.3))
            e = (hum * pressure) / (0.622 + 0.378 * hum)
            rh = np.clip(e / es, 0.01, 1.0)
            variables['humidity'] = rh.astype(np.float32)
        else:
            # Already RH (0-1) or percentage
            rh = hum / 100.0 if np.nanmax(hum) > 1.0 else hum
            variables['humidity'] = np.clip(rh, 0.01, 1.0).astype(np.float32)

        # 5) Sanity limits
        variables['lai'] = np.clip(variables['lai'], 0.0001, 6.0)
        variables['ndvi'] = np.clip(variables['ndvi'], -1.0, 1.0)
        variables['temperature'] = np.clip(variables['temperature'], -50.0, 60.0)
        variables['wind_speed'] = np.maximum(variables['wind_speed'], 2.0)
        variables['radiation'] = np.maximum(variables['radiation'], 0.0)

        # soil_fc: if provided as percent, convert to fraction
        if np.nanmax(variables['soil_fc']) > 1.0:
            variables['soil_fc'] = variables['soil_fc'] / 100.0

        # Soil moisture plausible ranges
        variables['soil_moisture_surface_prev'] = np.clip(variables['soil_moisture_surface_prev'], 0.01, 0.6)
        variables['soil_moisture_root_prev']    = np.clip(variables['soil_moisture_root_prev'],    0.01, 0.6)

        # Ensure float32 output
        for k in list(variables.keys()):
            variables[k] = variables[k].astype(np.float32)

        return variables


    def _run_complete_baitsss_physics(self, variables: Dict[str, np.ndarray],
                                  block_height: int, block_width: int) -> Dict[str, np.ndarray]:
        """
        Complete BAITSSS physics with iterative energy balance per block.
        """
        C = self.constants

        soil_awc = variables['soil_awc'].astype(np.float32)
        soil_fc  = variables['soil_fc'].astype(np.float32)
        elevation = variables['elevation'].astype(np.float32)
        nlcd = variables['nlcd'].astype(np.float32)
        precip_hour = variables['precipitation'].astype(np.float32)

        ndvi = variables['ndvi'].astype(np.float32)
        lai  = variables['lai'].astype(np.float32)
        Tair = variables['temperature'].astype(np.float32)
        RH   = np.clip(variables['humidity'], 0.01, 1.0)
        Uz   = np.maximum(variables['wind_speed'], 0.1).astype(np.float32)
        Rsw  = np.maximum(variables['radiation'], 0.0).astype(np.float32)

        sm_prev = np.clip(variables['soil_moisture_surface_prev'], 0.01, 0.6).astype(np.float32)
        rz_prev = np.clip(variables['soil_moisture_root_prev'],    0.01, 0.6).astype(np.float32)

        TairK = Tair + 273.15
        # Pressure (kPa) as function of elevation (m)
        P = 101.3 * np.power(((293.0 - elevation * 0.0065) / 293.0), 5.26)  # kPa
        psych = 0.000665 * P  # kPa/C
        # Air density rho (kg/m^3)
        rho_air = (P * 1000.0) / (287.0 * TairK)

        # Saturation/actual vapor pressure (kPa)
        es = 0.611 * np.exp((17.27 * Tair) / (Tair + 237.3))
        ea = RH * es

        # Incoming longwave
        emis_atm = 1.0 - 0.261 * np.exp(-0.000777 * (Tair ** 2))
        Rlw_in = (TairK ** 4) * C.Stefan_Boltzamn * emis_atm  # W/m^2

        # Canopy fraction fc from NDVI
        fc_raw = (ndvi - C.NDVImin) / (C.NDVImax - C.NDVImin + 1e-6)
        fc = np.clip(fc_raw, C.fc_min, C.fc_max).astype(np.float32)

        # Displacement / roughness (very simplified functions of LAI)
        hc = 0.15 * lai
        d  = 1.1 * hc * np.log(1.0 + np.power(0.2 * np.maximum(lai, 1e-6), 0.25))
        zom = 0.018 * np.maximum(lai, 1e-6)

        # Aerodynamic resistance rah
        z_w = np.maximum(C.z_b_wind - d, 0.5)
        z_a = np.maximum(C.z_b_air - d, 0.2)
        zom_safe = np.maximum(zom, 1e-4)

        log1 = np.log(np.maximum(z_w / zom_safe, 1.01))
        log2 = np.log(np.maximum(z_a / (0.1 * zom_safe), 1.01))
        rah_est = (log1 * log2) / (0.41 * 0.41 * np.maximum(Uz, 0.1))
        rah = np.clip(rah_est, C.rahlo, C.rahhi).astype(np.float32)

        # Boundary layer & canopy resistances
        rac = C.rb / (2.0 * np.maximum(lai / np.maximum(fc, 1e-3), 1e-3))
        # Bare vs. full veg soil aerodynamic resistance term
        ras_full = np.clip(hc * np.exp(2.5) / (0.41 * 0.41 * np.maximum(Uz, 0.1) * np.maximum(hc - d, 0.05)), 1.0, C.rl_max)
        ras_bare = np.clip((np.log(np.maximum(C.z_b_wind / C.Zos, 1.01)) *
                            np.log(np.maximum((d + zom_safe) / C.Zos, 1.01))) /
                        (0.41 * 0.41 * np.maximum(Uz, 0.1)), 1.0, C.rl_max)
        ras = np.where(fc >= C.fc_full_veg, 0.0,
                    np.clip(1.0 / ((fc / np.maximum(ras_full, 1.0)) +
                                    ((1.0 - fc) / np.maximum(ras_bare, 1.0))), 1.0, C.rl_max)).astype(np.float32)

        # Soil hydraulic thresholds
        theta_ref  = soil_fc
        theta_wilt = np.maximum(0.004, theta_ref - soil_awc)
        raw = C.MAD * soil_awc
        thres_mois = theta_ref - raw

        # Initialize iteration state
        ETsoil_sec_prev = np.full((block_height, block_width), 7.0191862e-005, dtype=np.float32)
        ETveg_sec_prev  = np.full((block_height, block_width), 5.0890540e-006, dtype=np.float32)
        H_soil_prev = np.zeros((block_height, block_width), dtype=np.float32)
        H_veg_prev  = np.zeros((block_height, block_width), dtype=np.float32)
        G_soil_prev = np.zeros((block_height, block_width), dtype=np.float32)

        sm = sm_prev.copy()
        rz = rz_prev.copy()

        for _ in range(5):
            # Soil surface resistance (dryness control)
            rss = np.clip(3.5 * np.power(C.Theta_sat / np.maximum(sm, 0.01), 2.3) + 33.5, 35.0, C.rl_max)

            # Soil surface temperature (stability feedback via H_soil_prev)
            Ts_eq = (H_soil_prev * (ras + rah)) / (rho_air * C.Cp) + TairK
            Ts = np.where(Rsw <= 100.0, TairK - 2.5, np.clip(Ts_eq, C.tslo, C.tshi)).astype(np.float32)

            # Latent heat of vaporization (J/kg)
            lambda_s = (2.501 - 0.00236 * (Ts - 273.15)) * 1_000_000.0
            # Saturation at soil surface & aerodynamic VPD (kPa)
            es_surf = 0.611 * np.exp((17.27 * (Ts - 273.15)) / ((Ts - 273.15) + 237.3))
            # Penman-Monteith-like (very simplified resistance network)
            LE_soil_PM = ((es_surf - ea) * C.Cp * rho_air) / (psych * (rah + rss + ras) + 1e-6)
            etsoil_sec = np.clip(LE_soil_PM / (lambda_s + 1e-6), C.ET_min, C.Ref_ET * C.Ref_fac).astype(np.float32)
            etsoil_sec_avg = (ETsoil_sec_prev + etsoil_sec) * 0.5

            # --- Vegetation component ---
            Tc_eq = (H_veg_prev * (rac + rah)) / (rho_air * C.Cp) + TairK
            Tc = np.where(fc <= C.fc_min, Ts,
                        np.where(Rsw <= 100.0, TairK - 2.5,
                                np.clip(Tc_eq, C.tslo, C.tshi))).astype(np.float32)

            lambda_v = (2.501 - 0.00236 * (Tc - 273.15)) * 1_000_000.0
            es_veg = 0.611 * np.exp((17.27 * (Tc - 273.15)) / ((Tc - 273.15) + 237.3))
            vpd = np.maximum(es_veg - ea, 0.0)

            f_light = (40.0 / C.rl_max + 0.55 * (Rsw / C.Rgl) * (2.0 / np.maximum(lai, 1e-3))) / \
                    (1.0 + 0.55 * (Rsw / C.Rgl) * (2.0 / np.maximum(lai, 1e-3)))
            # Temperature
            f_temp = 1.0 - 0.0016 * np.power(298.0 - TairK, 2)
            # Water stress (root zone)
            awf = np.clip((rz - theta_wilt) / np.maximum(theta_ref - theta_wilt, 1e-4), 0.0, 1.0)
            f_water = np.log(np.maximum(1.0, 800.0 * awf)) / np.log(800.0)
            # VPD
            f_vpd = np.clip(1.0 - 0.1914 * vpd, 0.1, 1.0)

            rsc = np.clip(40.0 / (np.maximum(lai / np.maximum(fc, 1e-3), 1e-3) *
                                np.maximum(f_light, 1e-3) *
                                np.maximum(f_temp, 1e-3) *
                                np.maximum(f_water, 1e-3) *
                                np.maximum(f_vpd, 1e-3)),
                        40.0, C.rl_max).astype(np.float32)

            LE_veg_PM = ((es_veg - ea) * C.Cp * rho_air) / (psych * (rsc + rac + rah) + 1e-6)
            etveg_sec = np.clip(LE_veg_PM / (lambda_v + 1e-6), C.ET_min, C.Ref_ET * C.Ref_fac).astype(np.float32)
            etveg_sec_avg = (ETveg_sec_prev + etveg_sec) * 0.5

            # --- Radiation / flux partitioning ---
            Rlw_out_soil = (Ts ** 4) * C.Emiss_soil * C.Stefan_Boltzamn
            Rlw_out_veg  = (Tc ** 4) * C.BB_Emissi  * C.Stefan_Boltzamn
            # Net radiation (soil & veg)
            Rn_soil = (Rsw * (1.0 - C.Albedo_soil) + Rlw_in - Rlw_out_soil -
                    (1.0 - C.Emiss_soil) * Rlw_in)
            Rn_veg  = (Rsw * (1.0 - C.Albedo_veg)  + Rlw_in - Rlw_out_veg  -
                    (1.0 - C.Emiss_veg)  * Rlw_in)

            # Latent heat fluxes from ET
            LE_soil = etsoil_sec_avg * lambda_s
            LE_veg  = etveg_sec_avg  * lambda_v

            # Ground heat flux fraction (day/night simple rule)
            G_frac_soil = np.where(Rsw > 100.0, 0.15, 0.05)
            G_soil = G_frac_soil * Rn_soil

            # Sensible heat = Rn - G - LE
            H_soil = np.clip(Rn_soil - G_soil - LE_soil, C.shlo, C.shhi)
            H_veg  = np.clip(Rn_veg  - LE_veg,           C.shlo, C.shhi)

            G_soil_prev = 0.5 * (G_soil_prev + G_soil)
            H_soil_prev = 0.5 * (H_soil_prev + H_soil)
            H_veg_prev  = 0.5 * (H_veg_prev  + H_veg)
            ETsoil_sec_prev = etsoil_sec_avg
            ETveg_sec_prev  = etveg_sec_avg

            # Update soil moisture states
            etsoil_h_mm = etsoil_sec_avg * 3600.0 * (1.0 - fc)
            etveg_h_mm  = etveg_sec_avg  * 3600.0 * fc

            # Surface layer:
            sm = np.clip(sm - (etsoil_h_mm / (C.soil_depth)), 0.01, theta_ref)

            # Root zone:
            rz = np.clip(rz + ((precip_hour - (etsoil_h_mm + etveg_h_mm)) / C.droot),
                        0.01, theta_ref)

            # Simple irrigation trigger on cropland (NLCD ~ 81-82)
            irrig = np.where((rz < thres_mois) & (nlcd >= 81) & (nlcd <= 82),
                            0.04 * C.droot, 0.0).astype(np.float32)  # mm/h
            rz = np.where(irrig > 0, np.clip(rz + 0.04, 0.01, theta_ref), rz)

        # Final hourly ET components (mm/hour)
        etsoil_hour = etsoil_sec_avg * 3600.0 * (1.0 - fc)
        etveg_hour  = etveg_sec_avg  * 3600.0 * fc
        et_total_hour = np.clip(etsoil_hour + etveg_hour, 0.0, 50.0).astype(np.float32)

        def _finite(a, fill=0.0):
            a = np.where(np.isfinite(a), a, fill).astype(np.float32)
            return a

        return {
            'et_hour':     _finite(et_total_hour),
            'soil_surface': _finite(sm),
            'soil_root':    _finite(rz),
            'irrigation':   _finite(irrig),
            'precip_hour':  _finite(precip_hour),
            'etsoil_hour':  _finite(etsoil_hour),
            'etveg_hour':   _finite(etveg_hour),
            'fc':           _finite(fc),
        }


    def _get_default_results(self, block_height: int, block_width: int) -> Dict[str, np.ndarray]:
        """Return default results for failed calculations"""
        return {
            'et_hour': np.full((block_height, block_width), 0.2, dtype=np.float32),
            'soil_surface': np.full((block_height, block_width), 0.2, dtype=np.float32),
            'soil_root': np.full((block_height, block_width), 0.3, dtype=np.float32),
            'irrigation': np.zeros((block_height, block_width), dtype=np.float32),
            'precip_hour': np.zeros((block_height, block_width), dtype=np.float32),
            'etsoil_hour': np.full((block_height, block_width), 0.1, dtype=np.float32),
            'etveg_hour': np.full((block_height, block_width), 0.1, dtype=np.float32),
            'fc': np.full((block_height, block_width), 0.3, dtype=np.float32)
        }


# Utility functions for backward compatibility
def safe_band_extraction(band_array: np.ndarray, index: int, default_value: float = 0.0) -> float:
    """Safe band extraction with default value"""
    if index < len(band_array) and not np.isnan(band_array[index]):
        return float(band_array[index])
    return default_value


def pad_array_to_length(input_array: np.ndarray, expected_length: int,
                       default_value: float = 0.0) -> np.ndarray:
    if len(input_array) >= expected_length:
        return input_array
    else:
        padding = np.full(expected_length - len(input_array), default_value)
        return np.concatenate([input_array, padding])


def validate_baitsss_inputs(ndvi: float, lai: float, tair_oc: float) -> bool:
    return (not np.isnan(tair_oc) and -50 < tair_oc < 60 and
            not np.isnan(ndvi) and -1 <= ndvi <= 1 and
            not np.isnan(lai) and lai >= 0)
