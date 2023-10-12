class ChangeController {

  HIDE_DURATION = 200

  /**
   *
   * @param {Playback} playback
   */
  constructor(playback) {
    this.playback = playback
    this.changes = []
  }

  deleteItem($el) {
    const xpath = createXPathFromElement($el.parent()[0])
    $el.hide(this.HIDE_DURATION, () => this.changes.push([$el.index(), $el.detach(), xpath]))
  }

  undo() {
    if (!this.changes.length) {
      return
    }
    const [originalIndex, $deletedItem, xpath] = this.changes.pop()
    const $container = $(lookupElementByXPath(xpath))
    this.playback.goToArticle($container.closest(FRAME_SELECTOR))
    this.playback.promise.then(() =>
      $deletedItem.insertBefore($container.children().eq(originalIndex)).show(this.HIDE_DURATION).focus()
    )
  }
}