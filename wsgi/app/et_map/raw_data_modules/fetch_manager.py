from typing import Dict
from .data_fetchers import BaseFetcher

class DataFetchManager:
    def __init__(self):
        self.fetchers: Dict[str, BaseFetcher] = {}

    def register_fetcher(self, dataset_name: str, fetcher: BaseFetcher):
        self.fetchers[dataset_name] = fetcher

    def fetch_dataset(self, dataset_name: str, date_from: str, date_to: str, geometry_json: str = None) -> bool:
        if dataset_name not in self.fetchers:
            print(f"No fetcher registered for dataset: {dataset_name}")
            return False

        fetcher = self.fetchers[dataset_name]

        try:
            print(f"Starting {dataset_name} fetch...")
            success = fetcher.fetch_data(date_from, date_to, geometry_json)

            if success:
                print(f"{dataset_name} fetch completed successfully")
            else:
                print(f"{dataset_name} fetch failed")

            return success

        except Exception as e:
            print(f"Error in {dataset_name} fetch: {e}")
            return False

    def get_registered_datasets(self) -> list:
        return list(self.fetchers.keys())

    def is_dataset_registered(self, dataset_name: str) -> bool:
        return dataset_name in self.fetchers

    def unregister_fetcher(self, dataset_name: str) -> bool:
        """Unregister a fetcher for testing"""
        if dataset_name in self.fetchers:
            del self.fetchers[dataset_name]
            print(f"Unregistered {dataset_name} fetcher")
            return True
        return False
