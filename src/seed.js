export const demoCopy = {
  id: 'demo-harbor-001',
  name: 'Harbor Trail',
  barcode: 'SC-001',
  isDemo: true,
  referenceImage: '/assets/tray-complete.svg',
  createdAt: '2026-11-19T12:00:00.000Z',
  components: [
    { id: 'pawns', name: 'Player pawns', expected: 4, manual: false },
    { id: 'dice', name: 'Dice', expected: 2, manual: false },
    { id: 'tiles', name: 'Trail tiles', expected: 6, manual: false },
    { id: 'board', name: 'Game board', expected: 1, manual: false },
    { id: 'cards', name: 'Adventure cards', expected: 30, manual: true }
  ]
};

export const scenarios = {
  missing: { label: 'Missing pawn', image: '/assets/tray-missing.svg', caption: 'One pawn is missing. The card stack still needs a manual count.' },
  complete: { label: 'Complete game', image: '/assets/tray-complete.svg', caption: 'Visible pieces match. Confirm all groups, including the card stack.' },
  uncertain: { label: 'Overlapping pieces', image: '/assets/tray-uncertain.svg', caption: 'Some tiles overlap. Review uncertain groups by hand.' }
};
