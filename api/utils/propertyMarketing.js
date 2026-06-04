'use strict';

function humanPropertyType(value = 'property') {
  const raw = String(value || 'property');
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/-/g, ' ');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildPropertyMarketing(property = {}, similarProperties = []) {
  const propertyType = humanPropertyType(property.property_type);
  const countyName = property.county || 'West Virginia';
  const cityName = property.city || 'the area';
  const isAdvent = /advent/i.test(`${property.address || ''} ${property.listing_slug || ''}`);

  const heroHighlights = isAdvent
    ? [
        'Close to Short Mountain Wildlife Management Area for hunting and weekend recreation.',
        'A potential setup for an off-grid retreat, cabin basecamp, or rural recreation use, subject to buyer verification.',
        'Useable ground that helps buyers picture a real first move, not just raw dirt.',
      ]
    : [
        `${propertyType} opportunity in ${countyName} County with local guidance from Phil Malick.`,
        'Built to help buyers request maps, access details, and next steps.',
        'Best for buyers who want real property intelligence, not just a few listing facts.',
      ];

  const perfectFor = isAdvent
    ? [
        'Hunters who want quick access to public-land recreation without giving up privacy.',
        'Buyers planning a weekend cabin, off-grid setup, or recreational escape in Hampshire County.',
        'Buyers comparing rural land uses and wanting local context before they commit.',
      ]
    : [
        `Buyers looking for ${propertyType.toLowerCase()} in ${countyName} County.`,
        'People who want local insight on road access, utilities, and due diligence before they commit.',
        'Anyone comparing several rural properties and needing clearer local context.',
      ];

  const useCases = isAdvent
    ? [
        'Set up a weekend hunting base or seasonal retreat close to Romney and public land access.',
        'Create a private cabin or camp-style setup for family getaways and short-stay potential.',
        'Review the land, structures, access, and improvement options before deciding whether it fits your plans.',
      ]
    : [
        `Consider it as a primary ${propertyType.toLowerCase()} purchase or rural-use property after reviewing the facts.`,
        'Request maps, access notes, and local context before making a showing decision.',
        'Turn interest into a real next step with a guided property packet and direct follow-up.',
      ];

  return {
    eyebrow: isAdvent ? 'Hampshire County Land Opportunity' : `${countyName} County ${propertyType}`,
    heroHeadline: isAdvent
      ? 'Get the maps, access details, and next-step guidance for this property.'
      : `See what this ${propertyType.toLowerCase()} can actually do for you.`,
    heroBody: isAdvent
      ? `${property.address || 'This property'} is positioned for buyers reviewing hunting access, cabin potential, and a true West Virginia weekend lifestyle. The goal here is simple: help buyers get the packet, understand the land, and verify whether it fits.`
      : `${property.address || 'This property'} is set up for buyers who want more than a generic listing sheet. Request the property packet, ask for access details, or get similar land options lined up with Phil Malick.`,
    heroHighlights,
    perfectFor,
    useCases,
    nearbyHeading: `More ${countyName} County opportunities`,
    nearbyIntro: similarProperties.length
      ? `If this property is close but not perfect, here are other active MalickLand opportunities in ${countyName} County.`
      : `If this one is close but not perfect, use the “similar land” alert below and Phil can send nearby options that better match your budget, timeline, or use case.`,
    countySearchPath: `/counties/${slugify(countyName)}`,
    countySearchLabel: `${countyName} County land`,
  };
}

module.exports = { buildPropertyMarketing, humanPropertyType, slugify };
