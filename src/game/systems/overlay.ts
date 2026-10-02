/**
 * A DOM overlay for the few places the game needs real text and a real button:
 * the content notes before play, and the one explicit choice at the border.
 *
 * Kept in the DOM rather than drawn in the scene because these are the moments
 * the player must be able to read and click reliably, including with a screen
 * reader and a keyboard.
 */

export interface OverlayAction {
  readonly id: string;
  readonly label: string;
  readonly onPick: () => void;
}

export interface OverlayContent {
  readonly title: string;
  readonly body?: string;
  readonly list?: readonly string[];
  readonly actions: readonly OverlayAction[];
  readonly hint?: string;
}

export class Overlay {
  private readonly root: HTMLDivElement;
  private disposed = false;

  constructor(content: OverlayContent, parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', content.title);

    const panel = document.createElement('div');
    panel.className = 'overlay__panel';

    const title = document.createElement('h1');
    title.className = 'overlay__title';
    title.textContent = content.title;
    panel.appendChild(title);

    if (content.body !== undefined) {
      const body = document.createElement('p');
      body.className = 'overlay__body';
      body.textContent = content.body;
      panel.appendChild(body);
    }

    if (content.list !== undefined && content.list.length > 0) {
      const list = document.createElement('ul');
      list.className = 'overlay__list';
      for (const item of content.list) {
        const entry = document.createElement('li');
        entry.textContent = item;
        list.appendChild(entry);
      }
      panel.appendChild(list);
    }

    const actions = document.createElement('div');
    actions.className = 'overlay__actions';
    for (const action of content.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'overlay__button';
      button.textContent = action.label;
      button.dataset['action'] = action.id;
      button.addEventListener('click', () => {
        action.onPick();
      });
      actions.appendChild(button);
    }
    panel.appendChild(actions);

    if (content.hint !== undefined) {
      const hint = document.createElement('p');
      hint.className = 'overlay__hint';
      hint.textContent = content.hint;
      panel.appendChild(hint);
    }

    this.root.appendChild(panel);
    parent.appendChild(this.root);

    // Fade in on the next frame so the transition actually runs.
    requestAnimationFrame(() => {
      if (!this.disposed) {
        this.root.dataset['visible'] = 'true';
      }
    });
  }

  /** Move keyboard focus to the first action, so the choice is reachable. */
  focusFirst(): void {
    this.root.querySelector<HTMLButtonElement>('.overlay__button')?.focus();
  }

  dispose(): void {
    this.disposed = true;
    this.root.remove();
  }
}
