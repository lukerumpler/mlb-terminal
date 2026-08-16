# Architecture Overview

SKIP is structured as a high-performance, Bloomberg-terminal-inspired baseball intelligence platform built on React 19, Vite, Express 4, tRPC, and Vitest.

## Layer Breakdown

- **Client (`client/`)**: React application featuring responsive layouts, custom Recharts visualizers, state persistence, data quality export toolkits, and accessible touch controls for mobile devices.
- **Server (`server/`)**: Express API server managing proxy routes, data fetchers, caching, rate-limiting, and AI integrations (`server/api/`).
- **Shared (`shared/`)**: Common utility functions, types, and schema contracts used across client and server.
- **Testing (`test/`)**: Comprehensive regression suite covering unit logic, server proxy handlers, component rendering, and user interactions.
