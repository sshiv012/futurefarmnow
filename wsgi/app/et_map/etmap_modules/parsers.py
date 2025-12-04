import json
import re
from typing import Dict
from datetime import datetime
from shapely.geometry import shape



class CurlCommandParser:
    @staticmethod
    def parse_curl_command(curl_command: str) -> Dict:
        print("Parsing curl command...")
        json_match = re.search(r"-d\s+['\"]({.*?})['\"]", curl_command, re.DOTALL)

        if not json_match:
            raise ValueError("Could not find JSON payload in curl command")

        json_str = json_match.group(1)

        try:
            json_str = re.sub(r'\s+', ' ', json_str)
            parsed_data = json.loads(json_str)

            print(f"Successfully parsed curl command")
            print(f"  Date range: {parsed_data.get('date_from')} to {parsed_data.get('date_to')}")
            print(f"  Geometry type: {parsed_data.get('geometry', {}).get('type', 'Unknown')}")

            return parsed_data

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in curl command: {e}")

    @staticmethod
    def validate_parsed_data(data: Dict) -> bool:
        required_fields = ['date_from', 'date_to', 'geometry']

        for field in required_fields:
            if field not in data:
                print(f"Missing required field: {field}")
                return False

        geometry = data.get('geometry', {})
        if 'type' not in geometry or 'coordinates' not in geometry:
            print("Invalid geometry structure")
            return False

        print("Data validation passed")
        return True

    @staticmethod
    def extract_url_from_curl(curl_command: str) -> str:
        # Pattern 1: curl -X POST http://...
        url_match = re.search(r'curl\s+(?:-X\s+\w+\s+)?(https?://[^\s]+)', curl_command)

        if url_match:
            return url_match.group(1)

        # Pattern 2: curl http://... (no -X flag)
        url_match = re.search(r'curl\s+(https?://[^\s]+)', curl_command)

        if url_match:
            return url_match.group(1)

        # Pattern 3: Look for any http/https URL in the command
        url_match = re.search(r'(https?://[^\s\'"]+)', curl_command)

        if url_match:
            return url_match.group(1)

        return ""

    @staticmethod
    def extract_headers_from_curl(curl_command: str) -> Dict[str, str]:
        headers = {}

        header_matches = re.findall(r'-H\s+["\']([^:]+):\s*([^"\']+)["\']', curl_command)

        for header_name, header_value in header_matches:
            headers[header_name.strip()] = header_value.strip()

        return headers


class RequestDataParser:
    @staticmethod
    def parse_date_range(date_from: str, date_to: str) -> Dict:

        try:
            start_date = datetime.fromisoformat(date_from)
            end_date = datetime.fromisoformat(date_to)

            if start_date > end_date:
                raise ValueError("Start date must be before end date")

            total_days = (end_date - start_date).days + 1

            return {
                'start_date': start_date,
                'end_date': end_date,
                'total_days': total_days,
                'date_from': date_from,
                'date_to': date_to
            }

        except ValueError as e:
            raise ValueError(f"Invalid date format: {e}")

    @staticmethod
    def parse_geometry(geometry_dict: Dict) -> Dict:
        try:
            geometry = shape(geometry_dict)
            bounds = geometry.bounds
            area_km2 = geometry.area * 111000 * 111000

            return {
                'geometry': geometry,
                'bounds': bounds,
                'area_km2': area_km2,
                'geometry_type': geometry_dict.get('type', 'Unknown')
            }

        except Exception as e:
            raise ValueError(f"Invalid geometry: {e}")

    @staticmethod
    def validate_request_data(request_data: Dict) -> Dict:
        required_fields = ['date_from', 'date_to', 'geometry']
        for field in required_fields:
            if field not in request_data:
                raise ValueError(f"Missing required field: {field}")

        date_info = RequestDataParser.parse_date_range(
            request_data['date_from'],
            request_data['date_to']
        )

        geometry_info = RequestDataParser.parse_geometry(request_data['geometry'])

        return {
            'original_request': request_data,
            'date_info': date_info,
            'geometry_info': geometry_info,
            'validated': True
        }
