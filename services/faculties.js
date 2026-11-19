// Faculties that MIU Events can publish as. The project had no faculty records, so this list is the
// single source: edit names here, and add a logo path (under /public) when a faculty logo is available.
// Content published as a faculty without a logo shows the MIU logo with the faculty name.
const MIU_LOGO = '/assets/img/pics/logo.svg.png';
const faculties = Object.freeze([
  { key: 'pharmacy', name: 'Faculty of Pharmacy', image: '' },
  { key: 'dentistry', name: 'Faculty of Oral and Dental Medicine', image: '' },
  { key: 'engineering', name: 'Faculty of Engineering Sciences and Arts', image: '' },
  { key: 'computer-science', name: 'Faculty of Computer Science', image: '' },
  { key: 'business', name: 'Faculty of Business Administration and International Trade', image: '' },
  { key: 'mass-communication', name: 'Faculty of Mass Communication', image: '' },
  { key: 'alsun', name: 'Faculty of Al-Alsun (Languages)', image: '' }
].map(Object.freeze));

const facultyByKey = key => faculties.find(faculty => faculty.key === key) || null;
const publicFaculties = () => faculties.map(({ key, name, image }) => ({ key, name, image: image || MIU_LOGO, hasLogo: Boolean(image) }));

module.exports = { faculties, facultyByKey, publicFaculties, MIU_LOGO };
