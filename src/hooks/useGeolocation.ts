import { useState, useEffect } from "react";

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        loading: false,
        error: "Geolocation is not supported by this browser.",
      }));
      return;
    }

    const onSuccess = (pos: GeolocationPosition) => {
      setState({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        loading: false,
        error: null,
      });
    };

    const onError = (err: GeolocationPositionError) => {
      const messages: Record<number, string> = {
        1: "Location permission denied. Please allow location access and reload.",
        2: "Location unavailable. Check your network connection.",
        3: "Location request timed out.",
      };
      setState((s) => ({
        ...s,
        loading: false,
        error: messages[err.code] ?? "Unknown location error.",
      }));
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });
  }, []);

  return state;
}
