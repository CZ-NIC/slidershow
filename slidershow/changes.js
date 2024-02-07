class Changes {

  HIDE_DURATION = 200

  /**
   *
   * @param {Playback} playback
   */
  constructor(playback) {
    this.hud = playback.hud
    /** @type {boolean} Use to check whereas the undo operation is running.
     *  While performing the undo operation, it is not possible to register a new one.
     *  This is to prevent a common situation when restoring the state will attempt
     *  to re-register the undo operation.
     *  */
    this.performing = false
    /**
     * @type {Array<Array>}
     */
    this.changes = []

    /**
    * @type {Array<Array>}
    */
    this.applied_changes = []

    // will be set later
    this.$buttonUndo = null
    this.$buttonRedo = null
  }


  /**
   *
   * @param {Function} fn Bidirectionally reversible operation. Gets called immediately with the `val` parameter.
   * @param {*} val Parameter given to the redo callback.
   * @param {*} previous Parameter given to the undo callback.
   * @param {boolean} run_now Directly run `fn(val)`
   * @returns
   */
  change(title, fn, val = null, previous = null, run_now = true) {
    this._change(fn, fn, val, previous, run_now, title)
  }

  /**
   *
   * @param {function} fn
   * @param {function} undo_fn
   * @param {?function} do_always Run both after fn and undo_fn.
   * @param {boolean} run_now Directly run `fn(val)`
   */
  undoable(title, fn, undo_fn, do_always = null, run_now = true) {
    this._change(fn, undo_fn, null, null, run_now, title, do_always)
  }

  _change(fn_redo, fn_undo = null, val = null, prev_val = null, run_now = true, title = "", do_always = null) {
    if (this.performing) { // already doing an undo operation
      return
    }
    this.changes.push([fn_redo, fn_undo, val, prev_val, title, do_always])

    this.applied_changes.length = 0
    this.$buttonRedo.prop("disabled", true)
    this.$buttonUndo.prop("disabled", false)
    $(window).on('beforeunload', () => true)
    if (run_now) {
      fn_redo(val)
      do_always?.()
    }
  }

  unblock_unload() {
    $(window).off("beforeunload")
  }

  redo() {
    this._perform(this.applied_changes, this.changes, true)
  }

  undo() {
    this._perform(this.changes, this.applied_changes, false)
  }

  _perform(stack1, stack2, redo = true) {
    if (!stack1.length) {
      return
    }
    const change = stack1.pop()
    stack2.push(change)
    const [fn_redo, fn_undo, val, prev_val, title, do_always] = change
    const value = redo ? val : prev_val
    const fn = redo ? fn_redo : fn_undo

    // Undo operation
    this.performing = true
    fn(value)
    do_always?.()
    if (title) {
      this.hud.info((redo ? "Redo" : "Undo") + ": " + title)
    }
    this.performing = false

    this.$buttonUndo.prop("disabled", !this.changes.length)
    if (!this.changes.length) {
      this.unblock_unload()
    }
    this.$buttonRedo.prop("disabled", !this.applied_changes.length)
  }

  setButtons($buttonUndo, $buttonRedo) {
    this.$buttonUndo = $buttonUndo.prop("disabled", !this.changes.length)
    this.$buttonRedo = $buttonRedo.prop("disabled", !this.applied_changes.length)
  }
}