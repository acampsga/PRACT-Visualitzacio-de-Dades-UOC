/**
 * projection.js - Cartographic projection utilities
 */

export function createProjection(width, height, bounds) {
  // Create appropriate projection for Balearic Islands
  // Returns projection function for coordinate transformation
  return {
    forward: (lon, lat) => [lon, lat], // placeholder
    inverse: (x, y) => [x, y]  // placeholder
  };
}

export function transformCoordinates(coords, projection) {
  // Transform coordinates using the provided projection
  return coords.map(coord => projection.forward(...coord));
}
