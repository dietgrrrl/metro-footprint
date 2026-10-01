export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  tripDate: string;
  totalLines: number;
  coveredLines: number;
  otherLines?: number;
  notes?: string;
  systemName?: string;
  createdAt: string;
}

export interface Photo {
  id: string;
  cityId: string;
  filename: string;
  caption: string;
  data: string;
}
