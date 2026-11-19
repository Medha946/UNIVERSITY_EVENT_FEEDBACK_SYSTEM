export function validateEvent(b) {
  const errors = [];
  const title = String(b.title ?? '').trim();
  const venue = String(b.venue ?? '').trim();
  const description = String(b.description ?? '').trim();
  const capacity = Number(b.capacity);
  const categoryId = Number(b.categoryId);
  if (title.length < 3 || title.length > 200) errors.push('Title must be 3-200 characters.');
  if (venue.length < 2 || venue.length > 100) errors.push('Venue must be 2-100 characters.');
  if (description.length > 2000) errors.push('Description is limited to 2000 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.eventDate ?? ''))) errors.push('Pick a valid date.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) errors.push('Capacity must be a whole number from 1 to 5000.');
  if (!Number.isInteger(categoryId) || categoryId < 1) errors.push('Choose a category.');
  return { errors, value: { title, venue, description, eventDate: b.eventDate, capacity, categoryId } };
}
