/**
 * store.js - Centralized state management
 */

export class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = [];
  }

  getState() {
    return { ...this.state };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }

  updateState(updates) {
    Object.assign(this.state, updates);
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  reset(initialState) {
    this.state = { ...initialState };
    this.notifyListeners();
  }
}

// Create and export default store instance
export const store = new Store({
  year: 2020,
  selectedMunicipi: null,
  dataLoaded: false,
  chartFilters: {},
  mapView: {
    center: [3.0976, 39.5696], // Balearic Islands center
    zoom: 10
  }
});
