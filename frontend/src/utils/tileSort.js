export function sortTiles(tiles) {
  const order = { W: 0, T: 1, D: 2, F: 3, J: 4 }
  return [...tiles].sort((a, b) => {
    const pa = order[a[0]], pb = order[b[0]]
    if (pa !== pb) return pa - pb
    return a.slice(1).localeCompare(b.slice(1), undefined, { numeric: true })
  })
}
