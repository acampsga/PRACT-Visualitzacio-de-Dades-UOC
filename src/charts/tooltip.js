/**
 * tooltip.js - Tooltip component for interactive elements
 */

export class Tooltip {
  constructor(options = {}) {
    this.options = {
      offset: options.offset || { x: 10, y: 10 },
      delay: options.delay || 200,
      ...options
    };
    this.tooltipElement = null;
    this.hideTimeout = null;
  }

  show(content, x, y) {
    this.createTooltip(content);
    this.positionTooltip(x, y);
  }

  hide() {
    if (this.tooltipElement) {
      this.tooltipElement.style.display = 'none';
    }
  }

  createTooltip(content) {
    if (!this.tooltipElement) {
      this.tooltipElement = document.createElement('div');
      this.tooltipElement.className = 'tooltip';
      document.body.appendChild(this.tooltipElement);
    }
    this.tooltipElement.innerHTML = content;
    this.tooltipElement.style.display = 'block';
  }

  positionTooltip(x, y) {
    if (this.tooltipElement) {
      this.tooltipElement.style.left = (x + this.options.offset.x) + 'px';
      this.tooltipElement.style.top = (y + this.options.offset.y) + 'px';
    }
  }

  destroy() {
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
  }
}
