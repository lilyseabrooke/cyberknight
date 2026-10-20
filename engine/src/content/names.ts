import type { Rng } from '../rng';

/** Street handles and cyber-tinged given names. Short, sharp, one syllable or two. */
const HANDLES = [
  'Nyx', 'Juno', 'Kestrel', 'Mox', 'Rook', 'Zed', 'Vesper', 'Jinx', 'Sable', 'Dex', 'Marlowe', 'Echo', 'Pike', 'Lux', 'Ono',
  'Fennec', 'Cass', 'Tarn', 'Ripley', 'Nova', 'Bishop', 'Quill', 'Raze', 'Odalys', 'Hex', 'Cinder', 'Wren', 'Flux', 'Onyx',
  'Brine', 'Sparrow', 'Tamsin', 'Vex', 'Halo', 'Ember', 'Slate', 'Argent', 'Cobalt', 'Thorn', 'Kite', 'Lark', 'Moth', 'Riot',
  'Sigil', 'Tern', 'Vale', 'Zephyr', 'Ash', 'Bram', 'Crow', 'Dune', 'Fable', 'Gale', 'Harrow', 'Iris', 'Jett', 'Knox', 'Lyric',
  'Merlin', 'Nix', 'Orin', 'Piper', 'Quartz', 'Rune', 'Saffron', 'Talon', 'Umber', 'Vireo', 'Wick', 'Yarrow', 'Zinc',
];

const FEMININE = [
  'Aaliyah', 'Abena', 'Adaeze', 'Adriana', 'Agnieszka', 'Aiko', 'Aisha', 'Akira', 'Alejandra', 'Alina', 'Amara', 'Amelie',
  'Ananya', 'Anastasia', 'Andrea', 'Anjali', 'Anneke', 'Antonia', 'Aroha', 'Astrid', 'Ayesha', 'Beatriz', 'Bianca', 'Bich',
  'Blessing', 'Bronwyn', 'Camila', 'Carmen', 'Catalina', 'Chiamaka', 'Chidinma', 'Chloe', 'Cleo', 'Connie', 'Daniela',
  'Darya', 'Deepika', 'Delphine', 'Dilnoza', 'Dolores', 'Dominika', 'Edith', 'Elena', 'Eliza', 'Elodie', 'Emeka', 'Esperanza',
  'Esther', 'Fatima', 'Felicia', 'Fernanda', 'Fiona', 'Flor', 'Freya', 'Gabriela', 'Giulia', 'Greta', 'Gwen', 'Hana',
  'Hannelore', 'Harriet', 'Hazel', 'Helga', 'Hye-jin', 'Ifeoma', 'Ilse', 'Imani', 'Ines', 'Ingrid', 'Irina', 'Isabel',
  'Isolde', 'Ivana', 'Jadwiga', 'Jamila', 'Jasmine', 'Joanna', 'Josefina', 'Julieta', 'Kalani', 'Kamala', 'Katarzyna',
  'Keiko', 'Kenya', 'Kimiko', 'Kiona', 'Lakshmi', 'Lan', 'Larissa', 'Leila', 'Leilani', 'Lena', 'Lidia', 'Lindiwe', 'Linh',
  'Liv', 'Lucia', 'Luz', 'Maeve', 'Magdalena', 'Mahsa', 'Mai', 'Malika', 'Marisol', 'Marta', 'Mei', 'Mercedes', 'Mina',
  'Miriam', 'Mirela', 'Naledi', 'Nadia', 'Nanami', 'Naomi', 'Natasha', 'Neha', 'Nia', 'Nneka', 'Noor', 'Nuala', 'Odette',
  'Olga', 'Olusola', 'Oyelaran', 'Paloma', 'Parisa', 'Penelope', 'Petra', 'Pilar', 'Priya', 'Qiu', 'Rachel', 'Rania',
  'Rebeca', 'Renata', 'Rina', 'Rosalind', 'Roxana', 'Ruth', 'Sakura', 'Salma', 'Samira', 'Sana', 'Sanjana', 'Saoirse',
  'Selma', 'Seo-yeon', 'Shanice', 'Shira', 'Sigrid', 'Simone', 'Siobhan', 'Sofia', 'Soraya', 'Sumiko', 'Svetlana',
  'Tabitha', 'Talia', 'Tamar', 'Tatiana', 'Thandiwe', 'Thuy', 'Tomasa', 'Trinh', 'Ulrike', 'Uzoma', 'Valentina', 'Vera',
  'Wanjiru', 'Wilhelmina', 'Xiomara', 'Yael', 'Yara', 'Yelena', 'Yetunde', 'Yoko', 'Yuki', 'Zainab', 'Zofia', 'Zuri',
];

const MASCULINE = [
  'Abdul', 'Adebayo', 'Adrian', 'Ahmed', 'Aiden', 'Akio', 'Alejandro', 'Alexei', 'Amadou', 'Andrzej', 'Anton', 'Arjun',
  'Arturo', 'Asher', 'Augustin', 'Baptiste', 'Bartosz', 'Bashir', 'Benedikt', 'Bilal', 'Boris', 'Branko', 'Cai', 'Callum',
  'Carlos', 'Cedric', 'Chen', 'Chidi', 'Cormac', 'Cyrus', 'Damian', 'Dariusz', 'Darnell', 'Dev', 'Diego', 'Dmitri',
  'Dong-hyun', 'Duc', 'Dwayne', 'Eamon', 'Edmundo', 'Eitan', 'Elias', 'Emre', 'Enzo', 'Ephraim', 'Ernesto', 'Fabian',
  'Faisal', 'Felix', 'Fernando', 'Finnegan', 'Florian', 'Gabriel', 'Gareth', 'Gideon', 'Giorgos', 'Goran', 'Gustavo',
  'Hamza', 'Hannes', 'Haruto', 'Hector', 'Henrik', 'Hiroshi', 'Hugo', 'Ibrahim', 'Idris', 'Igor', 'Ilya', 'Ivan', 'Jabari',
  'Jakub', 'Javier', 'Jerome', 'Jin', 'Joaquin', 'Jomo', 'Jun', 'Kaito', 'Kamal', 'Karim', 'Kasimir', 'Kenji', 'Khalid',
  'Kofi', 'Kwame', 'Lars', 'Lazlo', 'Leandro', 'Lennox', 'Leopold', 'Levi', 'Lorenzo', 'Lucian', 'Luka', 'Malcolm', 'Marek',
  'Mateo', 'Mehmet', 'Mikhail', 'Milan', 'Minh', 'Mustafa', 'Nathaniel', 'Nikolai', 'Nnamdi', 'Noam', 'Oleksandr', 'Oluwaseun',
  'Omar', 'Orlando', 'Oskar', 'Otieno', 'Pablo', 'Pavel', 'Pedro', 'Phong', 'Quentin', 'Rafael', 'Rahim', 'Rajesh',
  'Ramon', 'Rashid', 'Raul', 'Reuben', 'Rhys', 'Rodrigo', 'Rohan', 'Ruben', 'Salvador', 'Samir', 'Santiago', 'Sergei',
  'Shinji', 'Sibusiso', 'Silas', 'Soren', 'Stanislav', 'Tadeusz', 'Takeshi', 'Tariq', 'Teodor', 'Thabo', 'Theo', 'Tiago',
  'Tomasz', 'Tran', 'Tyrone', 'Ugo', 'Valentin', 'Viktor', 'Vincenzo', 'Wei', 'Wojciech', 'Xavier', 'Yannick', 'Yosef',
  'Yusuf', 'Zachariah', 'Zdenek', 'Zoltan',
];

const NEUTRAL = [
  'Alex', 'Ari', 'Avery', 'Bao', 'Billie', 'Blake', 'Charlie', 'Dana', 'Devon', 'Drew', 'Eden', 'Ellis', 'Emerson', 'Finley',
  'Gray', 'Harper', 'Indigo', 'Jamie', 'Jules', 'Kai', 'Kit', 'Lee', 'Morgan', 'Nico', 'Noa', 'Oakley', 'Pat', 'Quinn',
  'Reese', 'Remy', 'River', 'Robin', 'Sam', 'Sasha', 'Shay', 'Sky', 'Sol', 'Tatum', 'Taylor', 'Toni', 'Val', 'Zion',
];

const SURNAMES = [
  'Calloway', 'Vantablack', 'Ibarra', 'Kowalczyk', 'Dross', 'Maddox', 'Voss', 'Larkspur', 'Quint', 'Ashgrove', 'Lovelace',
  'Achebe', 'Mercer', 'Hollis', 'Abara', 'Abdullah', 'Adeyemi', 'Aguilar', 'Ahn', 'Akhtar', 'Alcantara', 'Aleksandrov',
  'Almeida', 'Alvarado', 'Anand', 'Andersson', 'Arakawa', 'Arroyo', 'Asante', 'Ashby', 'Baptiste', 'Barzani', 'Bashir',
  'Beaumont', 'Bellamy', 'Bergstrom', 'Bhatt', 'Blackwood', 'Boateng', 'Bondarenko', 'Bose', 'Brannigan', 'Bui', 'Cabrera',
  'Castellanos', 'Cavanaugh', 'Chakraborty', 'Chaudhry', 'Chavez', 'Chen', 'Cho', 'Chukwu', 'Cisneros', 'Colombo', 'Corbin',
  'Crowley', 'Cruz', 'Czerny', 'Dasgupta', 'Delacroix', 'Demir', 'Deschamps', 'Diallo', 'Dimitrov', 'Dlamini', 'Dobrev',
  'Dominguez', 'Donovan', 'Drummond', 'Dube', 'Duarte', 'Dvorak', 'Eze', 'Eriksen', 'Esposito', 'Fairweather', 'Farouk',
  'Fedorov', 'Ferreira', 'Finch', 'Flores', 'Fontaine', 'Forsythe', 'Fujimoto', 'Gallagher', 'Garza', 'Georgiou',
  'Ghosh', 'Gianopoulos', 'Gil', 'Goldfarb', 'Gomez', 'Grigoryan', 'Guerrero', 'Gupta', 'Gutierrez', 'Hadley', 'Haddad',
  'Halloran', 'Hamidi', 'Hashimoto', 'Hayashi', 'Hernandez', 'Hoang', 'Holloway', 'Hossain', 'Huang', 'Hughes', 'Ibekwe',
  'Ikeda', 'Ishikawa', 'Ivanov', 'Jankowski', 'Jaramillo', 'Jovanovic', 'Kaczmarek', 'Kamara', 'Kapoor', 'Karimi',
  'Kasprzak', 'Kato', 'Kaur', 'Keane', 'Kimura', 'Kozlov', 'Krishnan', 'Kruger', 'Kuznetsov', 'Lacroix', 'Lam', 'Laurent',
  'Lazar', 'Leclerc', 'Lemaire', 'Lindqvist', 'Lopez', 'Lungu', 'MacAllister', 'Madrigal', 'Mahlangu', 'Malik', 'Marchetti',
  'Marquez', 'Matsuda', 'Mbeki', 'McBride', 'Mehta', 'Mendoza', 'Mikhailov', 'Mishra', 'Mitchell', 'Mokoena', 'Molina',
  'Morales', 'Mueller', 'Mwangi', 'Nakagawa', 'Nasser', 'Ndlovu', 'Nguyen', 'Nikolaidis', 'Novak', 'Nwosu', 'Obi',
  'Ochoa', "O'Hara", 'Okafor', 'Okonkwo', 'Olawale', 'Oliveira', 'Ortega', 'Osei', 'Pacheco', 'Pak', 'Palmer', 'Papadakis',
  'Park', 'Pellegrini', 'Pereira', 'Petrov', 'Pham', 'Pillai', 'Popescu', 'Quispe', 'Rahman', 'Ramos', 'Rasmussen',
  'Reyes', 'Rinaldi', 'Rivera', 'Rojas', 'Rosenberg', 'Roy', 'Saito', 'Salazar', 'Sandoval', 'Sato', 'Schmidt', 'Sesay',
  'Shapiro', 'Sharma', 'Shevchenko', 'Silva', 'Singh', 'Sokolov', 'Soto', 'Stavros', 'Suarez', 'Sullivan', 'Sung',
  'Szymanski', 'Takahashi', 'Tanaka', 'Teixeira', 'Thapa', 'Tkachenko', 'Torres', 'Tran', 'Tshabalala', 'Ueda', 'Ujah',
  'Valdez', 'Vargas', 'Vasquez', 'Vega', 'Verbeek', 'Villanueva', 'Volkov', 'Wagner', 'Walczak', 'Wanjiku', 'Watanabe',
  'Weiss', 'Whitlock', 'Williams', 'Wojcik', 'Wong', 'Yadav', 'Yamamoto', 'Yilmaz', 'Yoon', 'Zafar', 'Zaman', 'Zhang',
  'Zielinski', 'Zimmerman', 'Zulu',
];

/** Surname-ish handles, for the occasional "Sterling-9" or "Vantablack". */
const TAGS = ['9', '7', '4', '12', 'Prime', 'II', 'Jr.', 'Null', 'Zero', 'XIII'];

/** Pools for the name generator; a person's gender narrows the given-name pool when known. */
export type NameGender = 'woman' | 'man' | 'nonbinary' | string;

/** Pull a pick and a fresh fraction out of one roll, so a name costs the rng exactly two draws. */
function split(r: number, n: number): [number, number] {
  const x = r * n;
  const i = Math.min(n - 1, Math.floor(x));
  return [i, x - i];
}

function givenFor(r: number, gender?: NameGender): string {
  // The roll's range is carved into pools; the position inside a slice picks the name.
  const u = r;
  const pick = (pool: string[], lo: number, hi: number) => pool[Math.min(pool.length - 1, Math.floor(((u - lo) / (hi - lo)) * pool.length))]!;
  if (u < 0.12) return pick(HANDLES, 0, 0.12);
  if (gender === 'woman') return u < 0.2 ? pick(NEUTRAL, 0.12, 0.2) : pick(FEMININE, 0.2, 1);
  if (gender === 'man') return u < 0.2 ? pick(NEUTRAL, 0.12, 0.2) : pick(MASCULINE, 0.2, 1);
  if (gender) return u < 0.5 ? pick(NEUTRAL, 0.12, 0.5) : u < 0.75 ? pick(FEMININE, 0.5, 0.75) : pick(MASCULINE, 0.75, 1);
  return u < 0.4 ? pick(NEUTRAL, 0.12, 0.4) : u < 0.7 ? pick(FEMININE, 0.4, 0.7) : pick(MASCULINE, 0.7, 1);
}

function surname(r: number): string {
  const pick = (pool: string[], lo: number, hi: number, x = r) => pool[Math.min(pool.length - 1, Math.floor(((x - lo) / (hi - lo)) * pool.length))]!;
  if (r < 0.1) {
    // Double-barreled: split the sub-range into two coordinates.
    const t = r / 0.1;
    const [i, f] = split(t, SURNAMES.length);
    return `${SURNAMES[i]}-${SURNAMES[Math.min(SURNAMES.length - 1, Math.floor(f * SURNAMES.length))]}`;
  }
  if (r < 0.14) {
    const t = (r - 0.1) / 0.04;
    const [i, f] = split(t, SURNAMES.length);
    return `${SURNAMES[i]}-${TAGS[Math.min(TAGS.length - 1, Math.floor(f * TAGS.length))]}`;
  }
  return pick(SURNAMES, 0.14, 1);
}

/** Roll a full name from a giant, many-cultured pool: a megacity's worth. Costs exactly two rng draws. */
export function rollFullName(rng: Rng, gender?: NameGender): string {
  const a = rng.next();
  const b = rng.next();
  return `${givenFor(a, gender)} ${surname(b)}`;
}

export const NAME_POOL_SIZE = { given: HANDLES.length + FEMININE.length + MASCULINE.length + NEUTRAL.length, surnames: SURNAMES.length };
