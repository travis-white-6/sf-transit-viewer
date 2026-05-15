export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  agency: "SF" | "BA";
  distanceMeters?: number;
}

export interface Arrival {
  line: string;
  destination: string;
  expectedTime: string | null;
  aimedTime: string;
  isLive: boolean;
}

export interface StopWithArrivals extends Stop {
  arrivals: Arrival[];
  fetchedAt: number;
}
