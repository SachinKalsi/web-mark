/**
 * XPath-based serialization and restoration of DOM Range.
 * Used by content script to persist highlight positions across page loads.
 * Runs in page context (content script).
 */

(function (global) {
  function getXPath(node, root) {
    if (!node || !root) return null;
    if (node.nodeType === Node.DOCUMENT_NODE) return '/';
    const parts = [];
    let n = node;
    while (n && n !== root) {
      let idx = 1;
      let sib = n.previousSibling;
      while (sib) {
        if (sib.nodeType === n.nodeType && sib.nodeName === n.nodeName) idx++;
        sib = sib.previousSibling;
      }
      const name = n.nodeType === Node.ELEMENT_NODE ? n.nodeName.toLowerCase() :
        n.nodeType === Node.TEXT_NODE ? 'text()' :
        n.nodeType === Node.COMMENT_NODE ? 'comment()' : 'node()';
      parts.push(name + '[' + idx + ']');
      n = n.parentNode;
    }
    parts.reverse();
    if (root.nodeType === Node.ELEMENT_NODE) {
      parts.unshift(root.nodeName.toLowerCase() + '[1]');
    }
    return '/' + parts.join('/');
  }

  function getNodeFromXPath(doc, xpathStr, root) {
    if (!doc || !xpathStr) return null;
    var contextNode = doc;
    try {
      var iter = doc.evaluate(xpathStr, contextNode, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
      var node = iter.iterateNext();
      return node;
    } catch (e) {
      return null;
    }
  }

  /**
   * Build XPath that works with document.evaluate.
   * Format: /html[1]/body[1]/div[1]/text()[2] etc.
   */
  function getXPathForNode(node, root) {
    root = root || (node && node.ownerDocument ? node.ownerDocument.documentElement : null);
    return getXPath(node, root);
  }

  /**
   * Create a Range from stored start/end XPath and offsets.
   * @param {Document} doc
   * @param {string} startXPath
   * @param {number} startOffset
   * @param {string} endXPath
   * @param {number} endOffset
   * @param {Element} root - optional root to evaluate under (e.g. article)
   */
  function rangeFromPaths(doc, startXPath, startOffset, endXPath, endOffset, root) {
    const startNode = getNodeFromXPath(doc, startXPath, root || doc);
    const endNode = getNodeFromXPath(doc, endXPath, root || doc);
    if (!startNode || !endNode) return null;
    try {
      const range = doc.createRange();
      range.setStart(startNode, Math.min(startOffset, startNode.length || 0));
      range.setEnd(endNode, Math.min(endOffset, endNode.length || 0));
      return range;
    } catch (e) {
      return null;
    }
  }

  /**
   * Serialize the current selection (Range) to path + offset.
   * @param {Range} range
   * @param {Element} root - optional root (e.g. documentElement)
   */
  function serializeRange(range, root) {
    if (!range) return null;
    const doc = range.startContainer.ownerDocument || range.startContainer;
    root = root || (doc.documentElement || doc);
    const startXPath = getXPathForNode(range.startContainer, root);
    const endXPath = getXPathForNode(range.endContainer, root);
    if (!startXPath || !endXPath) return null;
    return {
      startXPath,
      startOffset: range.startOffset,
      endXPath,
      endOffset: range.endOffset
    };
  }

  global.WebsiteHighlighterXPath = {
    getXPathForNode,
    getNodeFromXPath,
    rangeFromPaths,
    serializeRange
  };
})(typeof window !== 'undefined' ? window : self);
