/**
 * slider.js - Timeline slider component
 */

export class TimelineSlider {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    this.options = {
      min: options.min || 2006,
      max: options.max || 2025,
      step: options.step || 1,
      value: options.value || 2025,
      onChangeCallback: options.onChange || (() => {})
    };
    this.currentValue = this.options.value;
  }

  initialize() {
    this.render();
    this.attachEventListeners();
  }

  render() {
    // Create slider HTML elements
    if (!this.container) {
      console.error("Container for slider not found");
      return;
    }

    // Create wrapper div
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-slider-wrapper';

    // Create label
    const label = document.createElement('label');
    label.htmlFor = 'timeline-input';
    label.textContent = 'Any: ';
    label.className = 'timeline-label';

    // Create input range element
    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'timeline-input';
    input.className = 'timeline-input';
    input.min = this.options.min;
    input.max = this.options.max;
    input.step = this.options.step;
    input.value = this.options.value;

    // Create value display
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'timeline-value';
    valueDisplay.textContent = this.options.value;

    // Update value display on input
    input.addEventListener('input', (e) => {
      valueDisplay.textContent = e.target.value;
    });

    // Append elements
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(valueDisplay);
    this.container.appendChild(wrapper);
  }

  attachEventListeners() {
    // Listen for slider changes
    if (this.container) {
      this.container.addEventListener('input', (e) => {
        this.currentValue = parseInt(e.target.value);
        this.options.onChangeCallback(this.currentValue);
      });
    }
  }

  getValue() {
    return this.currentValue;
  }

  setValue(value) {
    this.currentValue = value;
    this.options.onChangeCallback(value);
  }
}
