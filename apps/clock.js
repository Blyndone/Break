/**
 * The millisecond readout that runs above a round, shared by the players'
 * overlay and the GM's window so both count the same way.
 *
 * The number is repainted from an animation frame loop rather than from a
 * render pass: it changes faster than an application can re-render, and
 * writing text into a node that already exists costs nothing and does not
 * disturb the layout around it.
 */
export class Clock {
  /** @type {number|null} performance.now() when the round went on screen. */
  startedAt = null

  /** @type {number} Seconds allowed to respond; 0 for no limit. */
  duration = 0

  /** @type {number|null} Handle for the running animation frame. */
  #frame = null

  /** @type {HTMLElement|null} The readout the loop writes into. */
  #display = null

  /**
   * Take on a round that is about to be drawn, so the first paint already
   * knows how long it runs for. The clock is not counting yet.
   * @param {number} [duration]  Seconds allowed to respond; 0 for no limit.
   */
  arm(duration = 0) {
    this.reset()
    this.duration = duration
  }

  /**
   * Start counting. Called once the round has actually painted, so the reading
   * is the time it has been visible and not the cost of rendering it.
   */
  begin() {
    this.startedAt = performance.now()
  }

  /** Forget the round. The readout holds whatever it last showed. */
  reset() {
    this.stop()
    this.startedAt = null
    this.duration = 0
  }

  /** Seconds since the round went on screen. */
  get spent() {
    return this.startedAt == null ? 0 : (performance.now() - this.startedAt) / 1000
  }

  /** Milliseconds since the round went on screen, or null before it did. */
  get elapsed() {
    return this.startedAt == null ? null : performance.now() - this.startedAt
  }

  /** True once a limited round has run out of time. */
  get spentOut() {
    return this.duration > 0 && this.spent >= this.duration
  }

  /** Time left while a limit is running, or time spent when there is none. */
  get value() {
    return this.duration > 0 ? Math.max(0, this.duration - this.spent) : this.spent
  }

  /** The reading as the templates print it, seeded into the first paint. */
  get reading() {
    return this.value.toFixed(3)
  }

  /**
   * The countdown bar is a CSS animation, but every re-render would restart it
   * from full. A negative delay equal to the time already spent resumes it
   * where it left off instead.
   */
  get delay() {
    return (-Math.min(this.spent, this.duration)).toFixed(3)
  }

  /**
   * Point the loop at the readout inside `root`. Every render replaces the
   * element the loop was writing into, so this runs again after each one.
   * @param {HTMLElement|null|undefined} root
   */
  attach(root) {
    this.stop()
    this.#display = root?.querySelector('[data-clock]') ?? null
    if (this.#display) this.#frame = requestAnimationFrame(this.#tick)
  }

  stop() {
    if (this.#frame == null) return
    cancelAnimationFrame(this.#frame)
    this.#frame = null
  }

  #tick = () => {
    // The element goes away on close and is replaced on every render; either
    // way this loop is done with it.
    if (!this.#display?.isConnected) {
      this.stop()
      return
    }

    this.#display.textContent = this.reading
    this.#frame = requestAnimationFrame(this.#tick)
  }
}
