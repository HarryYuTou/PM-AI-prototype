/**
 * Image-recognition boundary. No external request or real image analysis is made.
 * Later: send image + copy inventory + reference image to a server endpoint.
 * Keep API credentials on that server, never in browser JavaScript.
 * Expected response: { mode, components: [{ id, count: number|null, note }] }.
 * Unknown counts must remain null. Staff confirmation is always required.
 */
export async function recognizeComponents({ copy, source, scenario = 'missing', image }) {
  if (!image) throw new Error('Add a return photo before starting a check.');
  if (source !== 'sample' || !copy.isDemo) {
    return {
      mode: 'manual',
      components: copy.components.map(component => ({ id: component.id, count: null, note: 'Image recognition is not connected. Enter a manual count.' }))
    };
  }
  if (!['complete', 'missing', 'uncertain'].includes(scenario)) throw new Error('Choose an available demo scenario.');
  // Fixed fixtures for the explicitly labelled sample illustrations only.
  return {
    mode: 'demo',
    components: copy.components.map(component => ({
      id: component.id,
      count: component.manual || (scenario === 'uncertain' && component.id === 'tiles') ? null
        : scenario === 'missing' && component.id === 'pawns' ? component.expected - 1 : component.expected,
      note: component.manual ? 'A card stack cannot be verified from one image.'
        : scenario === 'uncertain' && component.id === 'tiles' ? 'The sample tiles overlap. Count them by hand.'
        : scenario === 'missing' && component.id === 'pawns' ? 'Sample result: one pawn appears to be missing.'
        : 'Sample result only. Confirm the count before saving.'
    }))
  };
}
