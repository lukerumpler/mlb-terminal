import React from 'react';
import { trpc } from '../lib/trpc';
import { C, sans, px } from '../constants/colors';
import { BALLPARKS } from '../constants/data';
import { Panel } from './atoms';

export default function BallparkWeatherPanel({ teamKey }) {
  const ballpark = BALLPARKS[teamKey?.toLowerCase()];
  
  const weatherQuery = trpc.weather.getBallparkWeather.useQuery(
    { lat: ballpark?.lat || 0, lon: ballpark?.lon || 0 },
    { enabled: !!ballpark }
  );

  if (!ballpark) return null;

  const { data, isLoading, error } = weatherQuery;

  const getWeatherDescription = (code) => {
    const codes = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };
    return codes[code] || 'Unknown';
  };

  const getWeatherIcon = (code) => {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌦️';
    if (code <= 65) return '🌧️';
    if (code <= 75) return '❄️';
    if (code <= 82) return '⛈️';
    return '🌩️';
  };

  return (
    <Panel title="Ballpark Conditions" accent={C.teal} badge={ballpark.name}>
      <div style={{ padding: '12px 14px' }}>
        {isLoading ? (
          <div style={sans({ fontSize: 11, color: C.text3 })}>Fetching live weather...</div>
        ) : error ? (
          <div style={sans({ fontSize: 11, color: C.rust })}>Weather data unavailable</div>
        ) : data ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 32 }}>{getWeatherIcon(data.current.weather_code)}</div>
            <div>
              <div style={sans({ fontSize: 18, fontWeight: 800, color: C.text })}>
                {Math.round(data.current.temperature_2m)}°C
              </div>
              <div style={sans({ fontSize: 11, fontWeight: 600, color: C.text2 })}>
                {getWeatherDescription(data.current.weather_code)}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={sans({ fontSize: 9, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.05em' })}>
                Humidity
              </div>
              <div style={sans({ fontSize: 11, fontWeight: 700, color: C.text2 })}>
                {data.current.relative_humidity_2m}%
              </div>
              <div style={sans({ fontSize: 9, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 })}>
                Wind
              </div>
              <div style={sans({ fontSize: 11, fontWeight: 700, color: C.text2 })}>
                {data.current.wind_speed_10m} km/h
              </div>
            </div>
          </div>
        ) : null}
        
        {data?.current?.precipitation > 0 && (
          <div style={{ 
            marginTop: 12, padding: '8px 10px', borderRadius: 6, background: C.rustSoft, border: `1px solid ${C.rustMid}`,
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={sans({ fontSize: 10.5, fontWeight: 700, color: C.rust })}>
              Precipitation detected ({data.current.precipitation}mm). Check for delay alerts.
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
