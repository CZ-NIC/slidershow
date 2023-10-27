class Changes {

  HIDE_DURATION = 200

  DELETE_EL = 0
  CALLBACK = 1

  /**
   *
   * @param {Playback} playback
   */
  constructor(playback) {
    this.playback = playback
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

    this.playback.hud.$hud_properties.on("click", "button.undo", () => this.undo())
    this.$button = $("<button/>", { "text": "undo", "class": "undo", "title": "Ctrl+Alt+Z" }).prop("disabled", !this.changes.length)
    this.playback.hud.$hud_properties.on("click", "button.redo", () => this.redo())
    this.$button_redo = $("<button/>", { "text": "redo", "class": "redo", "title": "Ctrl+Alt+Shift+Z" }).prop("disabled", !this.applied_changes.length)
  }


  /**
   *
   * @param {Function} fn Bidirectionally reversible operation. Gets called immediately with the `val` parameter.
   * @param {*} val Parameter given to the redo callback.
   * @param {*} previous Parameter given to the undo callback.
   * @returns
   */
  change(fn, val = null, previous = null) {
    if (this.performing) { // already doing an undo operation
      return
    }
    this._change(this.CALLBACK, fn, val, previous)
  }

  deleteItem($el) {
    const xpath = createXPathFromElement($el.parent()[0])
    $el.hide(this.HIDE_DURATION, () => this._change(this.DELETE_EL, [$el.index(), $el.detach(), xpath]))
  }


  _change(name, fn, val = null, prev_val = null) {
    this.changes.push([name, fn, val, prev_val])

    this.applied_changes.length = 0
    this.$button_redo.prop("disabled", true)
    this.$button.prop("disabled", false)
    $(window).on('beforeunload', () => true)
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
    const [name, fn, val, prev_val] = change
    const value = redo ? val : prev_val

    switch (name) {
      case this.DELETE_EL:
        const [originalIndex, $deletedItem, xpath] = fn

        const $container = $(lookupElementByXPath(xpath))
        this.playback.goToArticle($container.closest(FRAME_SELECTOR))
        this.playback.promise.then(() => {
          const $position = $container.children().eq(originalIndex)
          const $inserted = $position.length ? $deletedItem.insertBefore($position) : $deletedItem.appendTo($container)
          $inserted.show(this.HIDE_DURATION).focus()
        }
        )
        break;
      case this.CALLBACK:  // Undo the operation with a non serialized callback
        this.performing = true
        fn(value)
        this.performing = false
        break;
      default:
        this.playback.hud.alert(`Could not undo ${name}`)
        break;
    }

    this.$button.prop("disabled", !this.changes.length)
    if (!this.changes.length) {
      this.unblock_unload()
    }
    this.$button_redo.prop("disabled", !this.applied_changes.length)
  }

  get_button() {
    return this.$button
  }
  get_button_redo() {
    return this.$button_redo
  }
}