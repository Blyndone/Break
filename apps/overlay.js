import { Clock } from './clock.js'

const { ApplicationV2 } = foundry.applications.api
const { api } = foundry.applications

/**
 * Shared frame for the two full screen views of a round: the buzzer prompt the
 * players get, and the GM's copy of it.
 *
 * Both dim the screen behind a band of portraits, run the same clock above it,
 * and fade out at the end rather than being cut away mid frame.
 */
export class BreakOverlay extends api.HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: 'div',
    window: {
      frame: false,
      positioned: false,
    },
  }

  /** Times the round and drives the readout on the band. */
  clock = new Clock()

  /** How long a card takes to slide to a new place on the roster. */
  static SHUFFLE_MS = 320

  /**
   * Where each card sat before the render now under way.
   * @type {Map<string, DOMRect>}
   */
  #placements = new Map()

  /** Fade the overlay out, then tear it down. */
  async closeOverlay() {
    if (!this.rendered) return

    await this.#fadeOut()

    // animate: false matters. ApplicationV2's close animation stamps the
    // measured width/height and the window position onto the element as inline
    // styles, then collapses it with max-height: 0. On a frameless full screen
    // overlay that overrides our inset and drops the band at the top of the
    // screen for the length of the transition.
    await this.close({ animate: false })
  }

  /** Fade the overlay out before it is torn down. */
  async #fadeOut() {
    const element = this.element
    if (!element) return

    element.classList.add('break-closing')

    await new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        element.removeEventListener('transitionend', onEnd)
        resolve()
      }
      const onEnd = (event) => {
        // Children transition too; only our own opacity ends the fade.
        if (event.target === element && event.propertyName === 'opacity') finish()
      }

      element.addEventListener('transitionend', onEnd)
      // Fallback: transitionend never fires if the element is hidden or the
      // user has reduced motion turned on.
      setTimeout(finish, 400)
    })
  }

  /** Every card on the roster, keyed for measuring across a render. */
  #cards() {
    return this.element?.querySelectorAll('[data-card]') ?? []
  }

  /**
   * Slide each card from where it was to where it now is.
   *
   * A render replaces the roster wholesale, so a card that changes place has
   * no transition to run: it is a different element that simply appears
   * somewhere else. Measuring both sides of the render gives us the distance
   * it moved, and playing that offset off is the whole animation.
   */
  #shuffle() {
    const placements = this.#placements
    this.#placements = new Map()

    // Nothing to compare against on a first render, and nothing to play for a
    // player who would rather not watch things move.
    if (!placements.size) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    for (const card of this.#cards()) {
      const from = placements.get(card.dataset.card)
      if (!from) continue

      const to = card.getBoundingClientRect()
      const dx = from.x - to.x
      const dy = from.y - to.y

      // Sub-pixel drift is not a move.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

      // `translate` rather than `transform`, so this composes with whatever
      // transform the card already carries rather than replacing it.
      card.animate([{ translate: `${dx}px ${dy}px` }, { translate: 'none' }], {
        duration: this.constructor.SHUFFLE_MS,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      })
    }
  }

  async _preRender(context, options) {
    await super._preRender(context, options)

    this.#placements = new Map()
    for (const card of this.#cards()) {
      this.#placements.set(card.dataset.card, card.getBoundingClientRect())
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    // A re-render during a fade would otherwise stay invisible.
    this.element?.classList.remove('break-closing')
    // Every re-render replaces the element the clock was writing into, so the
    // loop has to be pointed at the new one.
    this.clock.attach(this.element)
    this.#shuffle()
  }

  _onClose(options) {
    super._onClose(options)
    this.clock.stop()
  }
}
