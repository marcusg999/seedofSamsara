/**
 * Sparse on-screen text.
 *
 * Journey carries its whole arc without dialogue, and that is the bar for the
 * Threshold and the Light, so text here is deliberately rationed: one short line,
 * centred low, fading in and out, and never two at once. Where a beat can work
 * without a line, it has none.
 *
 * Lives in the DOM rather than in the scene so it stays crisp at any pixel ratio
 * and is readable by a screen reader.
 */
export class Captions {
  private readonly root: HTMLDivElement;
  private readonly line: HTMLParagraphElement;
  private hideAt = 0;
  private shown = '';

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'captions';
    this.root.setAttribute('aria-live', 'polite');

    this.line = document.createElement('p');
    this.line.className = 'captions__line';
    this.root.appendChild(this.line);
    parent.appendChild(this.root);
  }

  /** Show a line for `seconds`. Passing the same text again does not restart it. */
  show(text: string, seconds = 4.5): void {
    if (text === this.shown) {
      return;
    }
    this.shown = text;
    this.line.textContent = text;
    this.root.dataset['visible'] = 'true';
    this.hideAt = performance.now() + seconds * 1000;
  }

  clear(): void {
    this.shown = '';
    this.root.dataset['visible'] = 'false';
    this.hideAt = 0;
  }

  update(): void {
    if (this.hideAt > 0 && performance.now() >= this.hideAt) {
      this.root.dataset['visible'] = 'false';
      this.shown = '';
      this.hideAt = 0;
    }
  }

  /** Current text, for the test API. */
  get text(): string {
    return this.shown;
  }

  dispose(): void {
    this.root.remove();
  }
}
