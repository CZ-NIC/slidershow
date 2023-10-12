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
    /**
     * @type {Array<Array>}
     */
    this.changes = []
  }

  /**
   *
   * @param {Function} undo
   */
  change(undo) {
    this._change(this.CALLBACK, undo)
  }

  deleteItem($el) {
    const xpath = createXPathFromElement($el.parent()[0])
    $el.hide(this.HIDE_DURATION, () => this._change(this.DELETE_EL, [$el.index(), $el.detach(), xpath]))
  }


  _change(name, instructions) {
    this.changes.push([name, instructions])

    $(window).on('beforeunload', () => true)
  }

  unblock_unload() {
    $(window).off("beforeunload")
  }

  undo() {
    if (!this.changes.length) {
      return
    }
    const [name, instructions] = this.changes.pop()
    switch (name) {
      case this.DELETE_EL:
        const [originalIndex, $deletedItem, xpath] = instructions
        const $container = $(lookupElementByXPath(xpath))
        this.playback.goToArticle($container.closest(FRAME_SELECTOR))
        this.playback.promise.then(() =>
          $deletedItem.insertBefore($container.children().eq(originalIndex)).show(this.HIDE_DURATION).focus()
        )
        break;
      case this.CALLBACK:  // Undo the operation with a non serialized callback
        instructions()
        break;
      default:
        this.playback.hud.alert(`Could not undo ${name}`)
        break;
    }

    if (!this.changes.length) {
      this.unblock_unload()
    }
  }
}