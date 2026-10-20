import type { Rng } from '../rng';

/**
 * Names, tagged by where they come from and how they sound.
 *
 * A name is two draws from the rng, as it always was, so adding a bigger table never shuffles anything else. The rolls
 * are carved up in `Roll` below. What a given person is likely to be called is steered by a `NameFlavor`: a set of
 * multipliers (which heritages, how likely a street handle, how likely a pompous name) built from where they were
 * rolled and what they do for a living. Nothing is ever ruled out; a flavor only shifts the odds.
 */

export type Heritage =
  | 'anglo' | 'euro' | 'slavic' | 'latin' | 'west_african' | 'east_african' | 'mena'
  | 'south_asian' | 'chinese' | 'japanese' | 'korean' | 'vietnamese';

interface Pool { f: string[]; m: string[]; n: string[]; last: string[] }

const POOLS: Record<Heritage, Pool> = {
  anglo: {
    f: ['Eliza', 'Harriet', 'Hazel', 'Rachel', 'Gwen', 'Fiona', 'Bronwyn', 'Maeve', 'Siobhan', 'Saoirse', 'Nuala', 'Penelope', 'Rosalind', 'Edith', 'Ruth', 'Esther', 'Tabitha', 'Beatrice', 'Charlotte', 'Eleanor', 'Florence', 'Imogen', 'Lucy', 'Molly', 'Nora', 'Olivia', 'Phoebe', 'Sarah', 'Susan', 'Margaret', 'Joanna', 'Rebecca', 'Emily', 'Hannah', 'Megan', 'Connie', 'Aaliyah', 'Imani', 'Jamila', 'Kenya', 'Shanice', 'Blessing', 'Chloe', 'Jasmine'],
    m: ['Adrian', 'Aiden', 'Callum', 'Cormac', 'Eamon', 'Finnegan', 'Gareth', 'Malcolm', 'Nathaniel', 'Quentin', 'Reuben', 'Rhys', 'Silas', 'Theo', 'Dwayne', 'Darnell', 'Jerome', 'Tyrone', 'Gideon', 'Oliver', 'Henry', 'George', 'Arthur', 'Walter', 'Richard', 'Simon', 'Graham', 'Dennis', 'Trevor', 'Kevin', 'Ewan', 'Duncan', 'Hamish', 'Lennox', 'Malachy', 'Declan'],
    n: ['Avery', 'Billie', 'Blake', 'Charlie', 'Devon', 'Drew', 'Ellis', 'Emerson', 'Finley', 'Harper', 'Jamie', 'Morgan', 'Oakley', 'Quinn', 'Reese', 'Remy', 'Robin', 'Taylor', 'Tatum'],
    last: ['Calloway', 'Maddox', 'Mercer', 'Hollis', 'Ashby', 'Bellamy', 'Beaumont', 'Blackwood', 'Corbin', 'Crowley', 'Donovan', 'Drummond', 'Fairweather', 'Finch', 'Forsythe', 'Gallagher', 'Hadley', 'Halloran', 'Holloway', 'Hughes', 'Keane', 'MacAllister', 'McBride', 'Mitchell', 'Palmer', 'Sullivan', 'Whitlock', 'Williams', 'Lovelace', 'Brannigan', 'Cavanaugh', 'Quint', 'Dross', 'Larkspur', 'Ashgrove', 'Vantablack', 'Harlow', 'Winslow', 'Thornton', 'Hargreaves', 'Dunmore', 'Rawlins', 'Shaw', 'Barrow', 'Tate', 'Abbott', 'Pratt', "O'Hara", 'Lindsay', 'Gibbs', 'Fletcher', 'Marsh', 'Rudd', 'Kemp', 'Burke', 'Doyle'],
  },
  euro: {
    f: ['Amelie', 'Anneke', 'Antonia', 'Astrid', 'Delphine', 'Elodie', 'Freya', 'Giulia', 'Greta', 'Hannelore', 'Helga', 'Ilse', 'Ingrid', 'Isolde', 'Liv', 'Odette', 'Sigrid', 'Simone', 'Ulrike', 'Penelope', 'Chiara', 'Elisabetta', 'Margit', 'Marianne', 'Katja', 'Lotte', 'Maren', 'Annika', 'Eirini', 'Dimitra', 'Sofia', 'Clemence', 'Marguerite'],
    m: ['Augustin', 'Baptiste', 'Benedikt', 'Cedric', 'Enzo', 'Fabian', 'Florian', 'Giorgos', 'Hannes', 'Henrik', 'Hugo', 'Lars', 'Leopold', 'Lorenzo', 'Oskar', 'Soren', 'Vincenzo', 'Yannick', 'Matthias', 'Dieter', 'Gunnar', 'Klaus', 'Lucien', 'Pierre', 'Stavros', 'Nikos', 'Emil', 'Anselm', 'Matteo', 'Raphael'],
    n: ['Andrea', 'Sasha', 'Noa', 'Kit', 'Val', 'Robin'],
    last: ['Bergstrom', 'Colombo', 'Delacroix', 'Deschamps', 'Esposito', 'Eriksen', 'Fontaine', 'Georgiou', 'Kruger', 'Lacroix', 'Laurent', 'Leclerc', 'Lemaire', 'Lindqvist', 'Marchetti', 'Mueller', 'Nikolaidis', 'Papadakis', 'Pellegrini', 'Rasmussen', 'Rinaldi', 'Schmidt', 'Verbeek', 'Wagner', 'Weiss', 'Zimmerman', 'Andersson', 'Stavros', 'Voss', 'Brandt', 'Hoffmann', 'Jansen', 'Moreau', 'Rossi', 'Bianchi', 'Lundgren', 'Nilsson', 'Vogel', 'Rosenberg', 'Goldfarb', 'Shapiro'],
  },
  slavic: {
    f: ['Agnieszka', 'Anastasia', 'Darya', 'Dominika', 'Irina', 'Ivana', 'Jadwiga', 'Katarzyna', 'Lidia', 'Magdalena', 'Mirela', 'Natasha', 'Olga', 'Petra', 'Svetlana', 'Tatiana', 'Vera', 'Yelena', 'Zofia', 'Bogdana', 'Milica', 'Oksana', 'Halyna', 'Ludmila', 'Zdenka', 'Mira'],
    m: ['Alexei', 'Andrzej', 'Anton', 'Bartosz', 'Boris', 'Branko', 'Dariusz', 'Dmitri', 'Goran', 'Igor', 'Ilya', 'Ivan', 'Jakub', 'Kasimir', 'Lazlo', 'Marek', 'Mikhail', 'Milan', 'Nikolai', 'Oleksandr', 'Pavel', 'Sergei', 'Stanislav', 'Tadeusz', 'Teodor', 'Viktor', 'Wojciech', 'Zdenek', 'Zoltan', 'Luka'],
    n: ['Sasha', 'Zhenya', 'Valya', 'Sanya'],
    last: ['Aleksandrov', 'Bondarenko', 'Czerny', 'Dimitrov', 'Dobrev', 'Dvorak', 'Fedorov', 'Grigoryan', 'Ivanov', 'Jankowski', 'Jovanovic', 'Kaczmarek', 'Kasprzak', 'Kowalczyk', 'Kozlov', 'Kuznetsov', 'Lazar', 'Mikhailov', 'Novak', 'Petrov', 'Popescu', 'Shevchenko', 'Sokolov', 'Szymanski', 'Tkachenko', 'Volkov', 'Walczak', 'Wojcik', 'Zielinski', 'Zhukov', 'Orlov', 'Morozov', 'Nowak', 'Horvat'],
  },
  latin: {
    f: ['Adriana', 'Alejandra', 'Beatriz', 'Bianca', 'Camila', 'Carmen', 'Catalina', 'Daniela', 'Dolores', 'Esperanza', 'Fernanda', 'Flor', 'Gabriela', 'Ines', 'Josefina', 'Julieta', 'Lucia', 'Luz', 'Marisol', 'Marta', 'Mercedes', 'Paloma', 'Pilar', 'Rebeca', 'Renata', 'Roxana', 'Tomasa', 'Valentina', 'Xiomara', 'Yesenia', 'Odalys', 'Lupe', 'Citlali', 'Ximena'],
    m: ['Alejandro', 'Arturo', 'Carlos', 'Diego', 'Edmundo', 'Ernesto', 'Fernando', 'Gabriel', 'Gustavo', 'Hector', 'Javier', 'Joaquin', 'Leandro', 'Mateo', 'Pablo', 'Pedro', 'Rafael', 'Ramon', 'Raul', 'Rodrigo', 'Ruben', 'Salvador', 'Santiago', 'Tiago', 'Xavier', 'Emiliano', 'Nahuel', 'Cuauhtemoc', 'Lazaro', 'Octavio'],
    n: ['Alex', 'Cris', 'Luz', 'Sol', 'Nico'],
    last: ['Aguilar', 'Alcantara', 'Almeida', 'Alvarado', 'Arroyo', 'Cabrera', 'Castellanos', 'Chavez', 'Cisneros', 'Cruz', 'Dominguez', 'Duarte', 'Ferreira', 'Flores', 'Garza', 'Gil', 'Gomez', 'Guerrero', 'Gutierrez', 'Hernandez', 'Ibarra', 'Jaramillo', 'Lopez', 'Madrigal', 'Marquez', 'Mendoza', 'Molina', 'Morales', 'Oliveira', 'Ortega', 'Ochoa', 'Pacheco', 'Pereira', 'Quispe', 'Ramos', 'Reyes', 'Rivera', 'Rojas', 'Salazar', 'Sandoval', 'Silva', 'Soto', 'Suarez', 'Teixeira', 'Torres', 'Valdez', 'Vargas', 'Vasquez', 'Vega', 'Villanueva'],
  },
  west_african: {
    f: ['Abena', 'Adaeze', 'Chiamaka', 'Chidinma', 'Ifeoma', 'Nneka', 'Olusola', 'Uzoma', 'Yetunde', 'Folasade', 'Amara', 'Ngozi', 'Efua', 'Akosua', 'Aminata', 'Fatoumata', 'Bisi', 'Titilayo', 'Zainab', 'Ama'],
    m: ['Adebayo', 'Amadou', 'Chidi', 'Emeka', 'Kofi', 'Kwame', 'Nnamdi', 'Oluwaseun', 'Ugo', 'Babatunde', 'Chinedu', 'Ibrahim', 'Kwesi', 'Mamadou', 'Obinna', 'Tunde', 'Yaw', 'Femi', 'Sekou', 'Ousmane'],
    n: ['Ade', 'Kamau', 'Dayo', 'Kemi', 'Tobi', 'Sade'],
    last: ['Abara', 'Achebe', 'Adeyemi', 'Asante', 'Boateng', 'Chukwu', 'Diallo', 'Eze', 'Ibekwe', 'Mensah', 'Nwosu', 'Obi', 'Okafor', 'Okonkwo', 'Olawale', 'Osei', 'Sesay', 'Ujah', 'Balogun', 'Camara', 'Traore', 'Owusu', 'Bangura', 'Adjei', 'Nwachukwu'],
  },
  east_african: {
    f: ['Lindiwe', 'Naledi', 'Thandiwe', 'Wanjiru', 'Wanjiku', 'Zuri', 'Amani', 'Nyambura', 'Makena', 'Aster', 'Tigist', 'Selam', 'Halima', 'Neema', 'Zawadi', 'Nomvula', 'Palesa'],
    m: ['Jomo', 'Otieno', 'Sibusiso', 'Thabo', 'Jabari', 'Kamau', 'Tendai', 'Musa', 'Baraka', 'Dawit', 'Haile', 'Tariku', 'Kagiso', 'Themba', 'Simba', 'Juma'],
    n: ['Amani', 'Zuri', 'Kagiso', 'Tau'],
    last: ['Dlamini', 'Dube', 'Kamara', 'Lungu', 'Mahlangu', 'Mbeki', 'Mokoena', 'Mwangi', 'Ndlovu', 'Tshabalala', 'Zulu', 'Wanjiku', 'Kimani', 'Otieno', 'Gebremariam', 'Tesfaye', 'Abebe', 'Mutua', 'Nkosi', 'Khumalo', 'Sithole', 'Moyo'],
  },
  mena: {
    f: ['Aisha', 'Fatima', 'Leila', 'Mahsa', 'Malika', 'Noor', 'Parisa', 'Rania', 'Salma', 'Samira', 'Soraya', 'Yasmin', 'Dilnoza', 'Layla', 'Hala', 'Nour', 'Shirin', 'Yael', 'Tamar', 'Shira', 'Miriam', 'Dalia', 'Reem', 'Jamila'],
    m: ['Abdul', 'Ahmed', 'Bashir', 'Bilal', 'Cyrus', 'Eitan', 'Emre', 'Faisal', 'Hamza', 'Idris', 'Karim', 'Khalid', 'Mehmet', 'Mustafa', 'Noam', 'Omar', 'Rashid', 'Samir', 'Tariq', 'Yosef', 'Yusuf', 'Dariush', 'Amir', 'Zaid', 'Levi', 'Kemal'],
    n: ['Noor', 'Sami', 'Ariel', 'Nur'],
    last: ['Abdullah', 'Akhtar', 'Barzani', 'Bashir', 'Demir', 'Farouk', 'Haddad', 'Hamidi', 'Karimi', 'Malik', 'Nasser', 'Yilmaz', 'Zafar', 'Zaman', 'Khoury', 'Mansour', 'Rahimi', 'Hosseini', 'Aziz', 'Qasim', 'Saleh', 'Cohen', 'Levy', 'Amrani', 'Benali'],
  },
  south_asian: {
    f: ['Ananya', 'Anjali', 'Ayesha', 'Deepika', 'Kamala', 'Lakshmi', 'Neha', 'Priya', 'Sanjana', 'Divya', 'Meera', 'Radha', 'Sunita', 'Tahmina', 'Nasreen', 'Kavya', 'Isha', 'Padma', 'Rukhsana', 'Shreya'],
    m: ['Arjun', 'Dev', 'Rajesh', 'Rohan', 'Rahim', 'Vikram', 'Sanjay', 'Imran', 'Anil', 'Sandeep', 'Tariq', 'Naveen', 'Kabir', 'Amit', 'Hari', 'Prakash', 'Ravi', 'Zubair'],
    n: ['Kiran', 'Jyoti', 'Sasha', 'Ari'],
    last: ['Anand', 'Bhatt', 'Bose', 'Chakraborty', 'Chaudhry', 'Dasgupta', 'Ghosh', 'Gupta', 'Hossain', 'Kapoor', 'Kaur', 'Krishnan', 'Mehta', 'Mishra', 'Pillai', 'Rahman', 'Sharma', 'Singh', 'Thapa', 'Yadav', 'Iyer', 'Reddy', 'Banerjee', 'Das', 'Khan', 'Patel', 'Joshi', 'Nair'],
  },
  chinese: {
    f: ['Bich', 'Lan', 'Mei', 'Qiu', 'Xiu', 'Ling', 'Yan', 'Hui', 'Jia', 'Fang', 'Li', 'Min', 'Ning', 'Xia', 'Yue', 'Zhen', 'Shu', 'Wen', 'Lian', 'Ying', 'Chun', 'Hua', 'Meiling', 'Xiaoyu'],
    m: ['Chen', 'Wei', 'Jun', 'Ming', 'Hao', 'Jian', 'Lei', 'Peng', 'Tao', 'Yong', 'Bo', 'Cheng', 'Feng', 'Gang', 'Kai', 'Liang', 'Qiang', 'Xin', 'Yifan', 'Zhi', 'Bao', 'Hong', 'Long', 'Shan'],
    n: ['Jing', 'Yu', 'Xiao', 'Lin', 'Bao', 'Yi'],
    last: ['Chen', 'Huang', 'Zhang', 'Wong', 'Wang', 'Li', 'Liu', 'Yang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Luo', 'Gao', 'Zheng', 'Liang', 'Xie', 'Tang', 'Han', 'Feng', 'Cao', 'Lam', 'Chan', 'Cheung', 'Leung', 'Ng', 'Tse'],
  },
  japanese: {
    f: ['Aiko', 'Hana', 'Keiko', 'Kimiko', 'Mina', 'Nanami', 'Rina', 'Sakura', 'Sumiko', 'Yoko', 'Yuki', 'Akane', 'Haruka', 'Mio', 'Noriko', 'Saki', 'Tomoko', 'Emi', 'Reiko', 'Chiyo'],
    m: ['Akio', 'Haruto', 'Hiroshi', 'Kaito', 'Kenji', 'Shinji', 'Takeshi', 'Daichi', 'Ren', 'Sora', 'Takumi', 'Yuto', 'Isamu', 'Masaru', 'Goro', 'Jiro', 'Ryu', 'Satoshi'],
    n: ['Akira', 'Haru', 'Kaoru', 'Rei', 'Hikaru', 'Makoto'],
    last: ['Arakawa', 'Fujimoto', 'Hashimoto', 'Hayashi', 'Ikeda', 'Ishikawa', 'Kato', 'Kimura', 'Matsuda', 'Nakagawa', 'Nakamura', 'Saito', 'Sato', 'Takahashi', 'Tanaka', 'Ueda', 'Watanabe', 'Yamamoto', 'Okada', 'Mori', 'Kobayashi', 'Inoue', 'Shimizu', 'Abe'],
  },
  korean: {
    f: ['Hye-jin', 'Seo-yeon', 'Ji-woo', 'Min-ji', 'Soo-ah', 'Eun-bi', 'Ha-eun', 'Yuna', 'Da-hye', 'Sun-hee', 'Mi-rae', 'Bo-ra'],
    m: ['Dong-hyun', 'Min-jun', 'Seung-ho', 'Joon', 'Tae-yang', 'Hyun-woo', 'Ji-hoon', 'Sung-min', 'Do-yoon', 'Kang'],
    n: ['Ji-an', 'Seo', 'Ha-neul', 'Woo-jin'],
    last: ['Ahn', 'Cho', 'Choi', 'Han', 'Jang', 'Jeong', 'Kang', 'Kim', 'Lee', 'Moon', 'Pak', 'Park', 'Shin', 'Song', 'Sung', 'Yoon', 'Yoo', 'Seo', 'Hwang', 'Baek'],
  },
  vietnamese: {
    f: ['Linh', 'Thuy', 'Trinh', 'Mai', 'Lan', 'Hoa', 'Ngoc', 'Thao', 'Huong', 'Quynh', 'Diem', 'Hanh'],
    m: ['Duc', 'Minh', 'Phong', 'Tran', 'Hieu', 'Khoa', 'Long', 'Nam', 'Quang', 'Tuan', 'Bao', 'Dung'],
    n: ['An', 'Anh', 'Kim', 'Phuong'],
    last: ['Bui', 'Dang', 'Do', 'Hoang', 'Huynh', 'Le', 'Ly', 'Ngo', 'Nguyen', 'Pham', 'Phan', 'Tran', 'Truong', 'Vo', 'Vu', 'Duong'],
  },
};

export const HERITAGES = Object.keys(POOLS) as Heritage[];

/** How common each heritage is across the city before any flavor is applied. */
const BASE_WEIGHT: Record<Heritage, number> = {
  anglo: 3, euro: 2, slavic: 1.2, latin: 2.5, west_african: 1.5, east_african: 1, mena: 1.5,
  south_asian: 2, chinese: 2, japanese: 1.2, korean: 1, vietnamese: 1,
};

/** Street handles and cyber-tinged names: short, sharp, belongs to nobody's grandmother. Used as a given name. */
const HANDLES = [
  'Nyx', 'Juno', 'Kestrel', 'Mox', 'Rook', 'Zed', 'Vesper', 'Jinx', 'Sable', 'Dex', 'Marlowe', 'Echo', 'Pike', 'Lux', 'Ono',
  'Fennec', 'Cass', 'Tarn', 'Ripley', 'Nova', 'Bishop', 'Quill', 'Raze', 'Hex', 'Cinder', 'Wren', 'Flux', 'Onyx',
  'Brine', 'Sparrow', 'Tamsin', 'Vex', 'Halo', 'Ember', 'Slate', 'Argent', 'Cobalt', 'Thorn', 'Kite', 'Lark', 'Moth', 'Riot',
  'Sigil', 'Tern', 'Vale', 'Zephyr', 'Ash', 'Bram', 'Crow', 'Dune', 'Fable', 'Gale', 'Harrow', 'Iris', 'Jett', 'Knox', 'Lyric',
  'Merlin', 'Nix', 'Orin', 'Piper', 'Quartz', 'Rune', 'Saffron', 'Talon', 'Umber', 'Vireo', 'Wick', 'Yarrow', 'Zinc',
  'Static', 'Glitch', 'Sync', 'Vinyl', 'Reverb', 'Cipher', 'Spike', 'Kilo', 'Delta', 'Byte', 'Strobe', 'Tempo', 'Bass',
];

/** Grand, pompous, double-barreled: names that sound like law firms. */
const GRAND = {
  f: ['Augustina', 'Cordelia', 'Rosamund', 'Theodora', 'Seraphina', 'Persephone', 'Octavia', 'Genevieve', 'Evangeline', 'Philippa', 'Henrietta', 'Cassandra', 'Ottoline', 'Clementine', 'Valentia', 'Marguerite-Anne', 'Araminta', 'Lavinia'],
  m: ['Aurelio', 'Percival', 'Cornelius', 'Peregrine', 'Montgomery', 'Barnaby', 'Leopold', 'Maximilian', 'Rupert', 'Sebastian', 'Cassius', 'Alistair', 'Fitzwilliam', 'Octavian', 'Reginald', 'Lucius', 'Crispin', 'Tiberius'],
  n: ['Ashton', 'Sinclair', 'Hartley', 'Wescott', 'Lennox', 'Montague', 'Beaufort', 'Carrington', 'Devereux', 'Fairfax'],
  last: ['Grimsby-Vault', 'Thornbury', 'Ashcroft', 'Pemberton', 'Fairchild', 'Vandermeer', 'Lockhart', 'Winterbourne', 'Hawthorne-Reyes', 'Blackmore', 'Cavendish', 'Kingsley', 'Sterling', 'Wellesley', 'Montrose', 'Harcourt', 'Aldridge', 'Rothschild-Ng', 'St. Clair', 'Delacourt', 'Marchbanks', 'Ravenscroft', 'Hightower', 'Carrow-Vance', 'Underhill', 'Whitcombe', 'Bellingham', 'Strathmore', 'Pettigrew', 'Van der Linde', 'Okonkwo-Vance', 'Nakamura-Reyes', 'Tanaka-Bell'],
};

/** Surname tags: the odd "Sterling-9". */
const TAGS = ['9', '7', '4', '12', 'Prime', 'II', 'Jr.', 'Null', 'Zero', 'XIII'];

/**
 * Multipliers that steer who gets which name. All optional, all default to 1, none ever forbids anything.
 * Build one from a place (`placeFlavor`), from wealth (`wealthFlavor`), from a job (`archetypeFlavor`), and `combineFlavors`.
 */
export interface NameFlavor {
  /** How much likelier each heritage is, relative to its base weight. */
  heritage?: Partial<Record<Heritage, number>>;
  /** Multiplier on the chance of a street handle for a given name (12% by default). */
  handle?: number;
  /** Multiplier on the chance of a grand, pompous name (3% by default). */
  grand?: number;
}

export function combineFlavors(...parts: (NameFlavor | undefined)[]): NameFlavor {
  const out: NameFlavor = {};
  for (const p of parts) {
    if (!p) continue;
    if (p.handle !== undefined) out.handle = (out.handle ?? 1) * p.handle;
    if (p.grand !== undefined) out.grand = (out.grand ?? 1) * p.grand;
    if (p.heritage) {
      out.heritage ??= {};
      for (const h of Object.keys(p.heritage) as Heritage[]) out.heritage[h] = (out.heritage[h] ?? 1) * p.heritage[h]!;
    }
  }
  return out;
}

/** The "respectable" end of the city has names that sound like the establishment, and the money to be pompous with. */
export function wealthFlavor(wealth: number): NameFlavor {
  const w = Math.max(0, Math.min(1, wealth));
  const establishment = 0.7 + w * 3;
  const rest = 1.1 - w * 0.5;
  const heritage: Partial<Record<Heritage, number>> = {};
  for (const h of HERITAGES) heritage[h] = h === 'anglo' || h === 'euro' ? establishment : rest;
  return { heritage, handle: 1.6 - w * 1.4, grand: 0.2 + 12 * w * w };
}

/** How rich each kind of generated district is, roughly (the mapgen labels, not the districtgen vector). */
const DISTRICT_WEALTH: Record<string, number> = { slum: 0.1, tenement: 0.3, industrial: 0.35, market: 0.45, nightlife: 0.5, corporate: 0.9 };

/** A place's pull on names: its district's wealth, and the heritage of the quarter it sits in, if it has one. */
export function placeFlavor(place?: { district?: string; heritage?: Heritage }): NameFlavor {
  if (!place) return {};
  const parts: NameFlavor[] = [];
  if (place.district && DISTRICT_WEALTH[place.district] !== undefined) parts.push(wealthFlavor(DISTRICT_WEALTH[place.district]!));
  if (place.heritage) {
    const heritage: Partial<Record<Heritage, number>> = {};
    for (const h of HERITAGES) heritage[h] = h === place.heritage ? 10 : 0.6;
    parts.push({ heritage });
  }
  return combineFlavors(...parts);
}

/** What you do shapes what you're called: a DJ is likelier to go by a handle than a corpo, who is likelier to sound grand. */
const JOB_FLAVOR: Record<string, NameFlavor> = {
  dj: { handle: 4 }, dancer: { handle: 3 }, bandmate: { handle: 4 }, hacker: { handle: 4 }, gym_influencer: { handle: 3 },
  pit_fighter: { handle: 3 }, ganger: { handle: 3 }, gang_runner: { handle: 3 }, gang_enforcer: { handle: 3 }, gang_captain: { handle: 3 },
  mugger: { handle: 2 }, dealer: { handle: 2 }, street_chemist: { handle: 2 }, fixer: { handle: 2 }, prophet: { handle: 2, grand: 2 },
  scrapper: { handle: 1.5 }, salvager: { handle: 1.5 },
  corpo: { handle: 0.1, grand: 3 }, suit: { handle: 0.1, grand: 3 }, atlas_rep: { handle: 0.1, grand: 2 }, realtor: { handle: 0.2, grand: 2.5 },
  heir: { handle: 0.3, grand: 8 }, scientist: { handle: 0.4, grand: 1.5 }, pharmacist: { handle: 0.4, grand: 1.5 }, pawn_broker: { handle: 0.5, grand: 1.5 },
  cop: { handle: 0.3 }, atlas_officer: { handle: 0.2 }, npd_officer: { handle: 0.3 }, npd_sergeant: { handle: 0.3 }, atlas_trooper: { handle: 0.2 },
};

export const archetypeFlavor = (archetype: string): NameFlavor => JOB_FLAVOR[archetype] ?? {};

/** A roll in [0, 1) that can be spent many times: each choice takes its share and hands back what is left. Two draws buy a whole name. */
class Roll {
  constructor(private u: number) {}
  int(n: number): number {
    const x = this.u * n;
    const i = Math.min(n - 1, Math.floor(x));
    this.u = x - i;
    return i;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  chance(p: number): boolean {
    const hit = this.u < p;
    this.u = hit ? this.u / p : (this.u - p) / (1 - p);
    return hit;
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    const total = items.reduce((s, t) => s + weight(t), 0);
    let x = this.u * total;
    for (const t of items) {
      const w = weight(t);
      if (x < w) {
        this.u = w > 0 ? x / w : 0;
        return t;
      }
      x -= w;
    }
    return items[items.length - 1]!;
  }
}

export type NameGender = 'woman' | 'man' | 'nonbinary' | string;

function givenPool(pool: Pick<Pool, 'f' | 'm' | 'n'>, roll: Roll, gender?: NameGender): string {
  if (gender === 'woman') return roll.chance(0.06) ? roll.pick(pool.n) : roll.pick(pool.f);
  if (gender === 'man') return roll.chance(0.06) ? roll.pick(pool.n) : roll.pick(pool.m);
  const all = roll.chance(0.45) ? pool.n : roll.chance(0.5) ? pool.f : pool.m;
  return roll.pick(all);
}

/**
 * Roll a full name. Costs exactly two rng draws. `gender` narrows the given name, `flavor` shifts the odds
 * (see `NameFlavor`); with neither it draws from the whole city.
 */
export function rollFullName(rng: Rng, gender?: NameGender, flavor: NameFlavor = {}): string {
  const a = new Roll(rng.next());
  const b = new Roll(rng.next());
  const weight = (h: Heritage) => BASE_WEIGHT[h] * (flavor.heritage?.[h] ?? 1);
  const handleChance = Math.min(0.9, 0.12 * (flavor.handle ?? 1));
  const grandChance = Math.min(0.6, 0.03 * (flavor.grand ?? 1));

  let given: string;
  let heritage: Heritage | null = null;
  let grand = false;
  if (a.chance(handleChance)) {
    given = a.pick(HANDLES);
  } else if (a.chance(grandChance / (1 - handleChance))) {
    grand = true;
    given = givenPool(GRAND, a, gender);
  } else {
    heritage = a.weighted(HERITAGES, weight);
    given = givenPool(POOLS[heritage], a, gender);
  }

  // Surnames: usually of the same heritage as the given name, sometimes not (a mixed city), sometimes two at once.
  const own = heritage ?? b.weighted(HERITAGES, weight);
  const any = () => POOLS[b.weighted(HERITAGES, weight)];
  let last: string;
  if (grand && b.chance(0.75)) last = b.pick(GRAND.last);
  else if (b.chance(0.1)) last = `${b.pick(POOLS[own].last)}-${b.pick(any().last)}`;
  else if (b.chance(0.04)) last = `${b.pick(POOLS[own].last)}-${b.pick(TAGS)}`;
  else if (b.chance(0.12)) last = b.pick(any().last);
  else last = b.pick(POOLS[own].last);
  return `${given} ${last}`;
}

export const NAME_POOL_SIZE = {
  given: HANDLES.length + Object.values(POOLS).reduce((s, p) => s + p.f.length + p.m.length + p.n.length, 0) + GRAND.f.length + GRAND.m.length + GRAND.n.length,
  surnames: Object.values(POOLS).reduce((s, p) => s + p.last.length, 0) + GRAND.last.length,
};
