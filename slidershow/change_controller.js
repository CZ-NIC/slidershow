class ChangeController {

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

    this.$button = $("<button/>", { "text": "undo", })
      .on("click", () => {
        this.undo()
        return false
      })
      .prop("disabled", !this.changes.length)
  }


  /**
   *
   * @param {Function} undo
   * @param {*} identity Prevent registering two successive events with the same identity check in a row.
   * @param {*} extra Any parameter given to the undo callback. TODO not used
   * @returns
   */
  change(undo, identity = null, extra = null) {
    if (identity && this.changes.length && this.changes.slice(-1)[0][2] === identity) {

      console.log("43:  identity", identity) // TODO

      return
    }

    console.log("48:  identity", identity) // TODO

    if (this.performing) { // already doing an undo operation
      return
    }
    this._change(this.CALLBACK, undo, identity, extra)
  }

  deleteItem($el) {
    const xpath = createXPathFromElement($el.parent()[0])
    $el.hide(this.HIDE_DURATION, () => this._change(this.DELETE_EL, [$el.index(), $el.detach(), xpath]))
  }


  _change(name, instructions, identity = null, extra = null) {
    this.changes.push([name, instructions, identity, extra])

    this.$button.prop("disabled", false)
    $(window).on('beforeunload', () => true)
  }

  unblock_unload() {
    $(window).off("beforeunload")
  }

  undo() {
    if (!this.changes.length) {
      return
    }
    const [name, instructions, _, extra] = this.changes.pop()
    switch (name) {
      case this.DELETE_EL:
        const [originalIndex, $deletedItem, xpath] = instructions

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
        instructions(extra)
        this.performing = false
        break;
      default:
        this.playback.hud.alert(`Could not undo ${name}`)
        break;
    }

    if (!this.changes.length) {
      this.$button.prop("disabled", true)
      this.unblock_unload()
    }
  }

  get_button() {
    return this.$button
  }
}