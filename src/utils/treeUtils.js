// ─── treeUtils.js ─────────────────────────────────────────────────────────────
// Utilities for building and flattening hierarchical LRA/Anggaran data

/**
 * Given a flat list of items with .kode like "1", "1.1", "1.1.a",
 * build a hierarchical tree.
 * 
 * Depth rules:
 *  - Single segment ("1", "2") → depth 0 (top-level group header)
 *  - Two segments ("1.1", "2.1") → depth 1 (sub-group)
 *  - Three+ segments ("1.1.a", "1.1.1") → depth 2+ (detail / posting line)
 */
export function buildAnggaranTree(items) {
  if (!items || items.length === 0) return []

  const roots = []
  const map = {}

  // Create nodes
  items.forEach(item => {
    map[item.kode] = { ...item, children: [], _depth: getDepth(item.kode) }
  })

  // Attach to parents
  items.forEach(item => {
    const parentKode = getParentKode(item.kode)
    if (parentKode && map[parentKode]) {
      map[parentKode].children.push(map[item.kode])
    } else {
      roots.push(map[item.kode])
    }
  })

  return roots
}

/** Get the depth level of a code string */
function getDepth(kode) {
  if (!kode) return 0
  const str = String(kode)
  // Count dots to determine depth
  return str.split('.').length - 1
}

/** Get parent kode by removing the last segment */
function getParentKode(kode) {
  const str = String(kode)
  const lastDot = str.lastIndexOf('.')
  if (lastDot < 0) return null
  return str.substring(0, lastDot)
}

/**
 * Flatten a tree back into a list with depth and parent info attached.
 * Used for rendering hierarchical tables.
 */
export function flattenWithDepth(nodes, depth = 0) {
  const result = []
  nodes.forEach(node => {
    result.push({ ...node, _depth: depth, _hasChildren: node.children && node.children.length > 0 })
    if (node.children && node.children.length > 0) {
      result.push(...flattenWithDepth(node.children, depth + 1))
    }
  })
  return result
}

/**
 * Build a hierarchical display list from flat anggaran items.
 * Returns flat list with _depth for indentation.
 */
export function buildFlatHierarchy(items) {
  const tree = buildAnggaranTree(items)
  return flattenWithDepth(tree, 0)
}

/**
 * Get row style for a given depth in the anggaran tree.
 */
export function getRowStyle(item) {
  const depth = item._depth || 0
  const hasChildren = item._hasChildren || (item.children && item.children.length > 0)
  return {
    fontWeight: depth === 0 ? 700 : depth === 1 && hasChildren ? 600 : 400,
    background: depth === 0 ? 'var(--bg-secondary)' :
                depth === 1 && hasChildren ? 'rgba(255,255,255,0.02)' : 'transparent',
    fontSize: depth === 0 ? 13 : 12,
    paddingLeft: depth === 0 ? 8 : depth === 1 ? 20 : 36,
    borderTop: depth === 0 ? '2px solid var(--border)' : undefined,
    color: item.is_total ? 'var(--primary)' : undefined,
  }
}

/**
 * Build COA tree grouped display for financial reports (LabaRugi/Neraca).
 * Accepts coaTree (hierarchical) and a balance map {code: value}.
 * Returns flat list with depth, name, code, value, and isHeader flag.
 */
export function buildCOAHierarchyRows(coaTree, balanceMap, filterFn) {
  const result = []

  function traverse(nodes, depth) {
    nodes.forEach(node => {
      const passes = !filterFn || filterFn(node)
      if (!passes) return

      const hasChildren = node.children && node.children.length > 0
      const balance = balanceMap[node.code] || 0

      // Only include nodes that have a balance or have children
      const childRows = []
      if (hasChildren) {
        traverse(node.children, depth + 1)
      }

      const isPostingWithBalance = !hasChildren && balance !== 0
      const isGroupWithChildren = hasChildren

      if (isGroupWithChildren || isPostingWithBalance) {
        result.push({
          code: node.code,
          name: node.name,
          value: balance,
          depth,
          isHeader: hasChildren,
          type: node.type,
          category: node.category,
        })
      }
    })
  }

  traverse(coaTree, 0)
  return result
}
