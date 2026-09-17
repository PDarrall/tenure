/**
 * Fictional manager names. Pools are generic given-name and surname
 * fragments per nationality; combinations are checked for uniqueness within a
 * world. No real person is intended.
 */
import type { Rng } from '../rng.js'
import type { Nationality } from '../types.js'

export const POOLS: Record<Nationality, { first: string[]; last: string[] }> = {
  home: {
    first: [
      'Alan', 'Barry', 'Callum', 'Dean', 'Eddie', 'Frank', 'Gary', 'Harry', 'Ian', 'Jack',
      'Kevin', 'Lee', 'Mark', 'Neil', 'Owen', 'Paul', 'Rob', 'Steve', 'Tom', 'Wayne',
      'Ashley', 'Ben', 'Craig', 'Danny', 'Gavin', 'Jamie', 'Kieran', 'Liam', 'Nathan', 'Ryan',
      'Scott', 'Shaun', 'Terry', 'Carl', 'Glen', 'Stuart', 'Darren', 'Phil', 'Tony', 'Martin',
    ],
    last: [
      'Ashworth', 'Bellamy', 'Cartwright', 'Dawes', 'Ellison', 'Fairbrother', 'Garside', 'Hollins',
      'Ingram', 'Jessop', 'Kendrick', 'Lomax', 'Marsden', 'Nuttall', 'Oldfield', 'Pargeter',
      'Quigley', 'Rowntree', 'Sowerby', 'Thackeray', 'Underhill', 'Varley', 'Whitworth', 'Yardley',
      'Ackroyd', 'Bickerstaff', 'Cudworth', 'Dunmore', 'Eccles', 'Farrow', 'Greenhalgh', 'Haworth',
      'Ibbotson', 'Jagger', 'Kitson', 'Lightfoot', 'Mosley', 'Noble', 'Ormerod', 'Pickering',
      'Ramsbottom', 'Stott', 'Tattersall', 'Usher', 'Verity', 'Walmsley', 'Youngman', 'Ainscough',
      'Broadbent', 'Clegg',
    ],
  },
  big: {
    first: [
      'Álvaro', 'Borja', 'César', 'Diego', 'Emilio', 'Fernando', 'Gonzalo', 'Iker', 'Javier', 'Luis',
      'Marcos', 'Nacho', 'Óscar', 'Pablo', 'Raúl', 'Sergio', 'Tomás', 'Unai', 'Víctor', 'Xavi',
    ],
    last: [
      'Aranda', 'Bermúdez', 'Castaño', 'Delgado', 'Esteban', 'Ferrer', 'Gallardo', 'Herrera', 'Ibáñez',
      'Jurado', 'Lozano', 'Márquez', 'Navarro', 'Ortega', 'Pascual', 'Quintana', 'Rubio', 'Salinas',
      'Tejero', 'Urrutia', 'Valverde', 'Zubiri', 'Alcaraz', 'Bravo', 'Cordero',
    ],
  },
  mid: {
    first: [
      'Andreas', 'Bernd', 'Christoph', 'Dieter', 'Erik', 'Florian', 'Gerd', 'Hannes', 'Jens', 'Klaus',
      'Lukas', 'Matthias', 'Niklas', 'Oliver', 'Peter', 'Ralf', 'Stefan', 'Thorsten', 'Uwe', 'Wolfgang',
    ],
    last: [
      'Achterberg', 'Brandt', 'Dallmann', 'Eberhardt', 'Falk', 'Gruber', 'Hartmann', 'Jäger', 'Kessler',
      'Lindner', 'Mayer', 'Neubauer', 'Ostermann', 'Pfeiffer', 'Reinhardt', 'Schuster', 'Thalberg',
      'Ullmann', 'Vogt', 'Wendt', 'Ziegler', 'Baumgart', 'Kranz', 'Lorenz', 'Sauer',
    ],
  },
  small: {
    first: [
      'Anders', 'Bjørn', 'Christian', 'Dag', 'Einar', 'Frode', 'Gunnar', 'Håkon', 'Ivar', 'Jonas',
      'Kjetil', 'Lars', 'Magnus', 'Nils', 'Ole', 'Per', 'Rune', 'Stig', 'Tore', 'Vidar',
    ],
    last: [
      'Aasland', 'Bakke', 'Dahl', 'Eriksen', 'Fjeldstad', 'Grøndahl', 'Haugen', 'Iversen', 'Johansen',
      'Knutsen', 'Lunde', 'Moen', 'Nygaard', 'Olsen', 'Pedersen', 'Rasmussen', 'Solberg', 'Tveit',
      'Ulriksen', 'Vinje', 'Walther', 'Berge', 'Kristoffersen', 'Lindqvist', 'Strand',
    ],
  },
}

const INITIALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W']
/** Tries at a plain name before falling back to one with a middle initial. */
const PLAIN_ATTEMPTS = 40
const INITIAL_ATTEMPTS = 2000

export class ManagerNamer {
  private readonly used: Set<string>
  constructor(
    private readonly rng: Rng,
    alreadyUsed: Iterable<string> = [],
  ) {
    this.used = new Set(alreadyUsed)
  }

  next(nationality: Nationality): string {
    const pool = POOLS[nationality]
    for (let attempt = 0; attempt < PLAIN_ATTEMPTS; attempt++) {
      const name = `${this.rng.pick(pool.first)} ${this.rng.pick(pool.last)}`
      if (!this.used.has(name)) {
        this.used.add(name)
        return name
      }
    }
    // The plain pool is nearly spent (a long-running world): add a middle initial.
    for (let attempt = 0; attempt < INITIAL_ATTEMPTS; attempt++) {
      const name = `${this.rng.pick(pool.first)} ${this.rng.pick(INITIALS)}. ${this.rng.pick(pool.last)}`
      if (!this.used.has(name)) {
        this.used.add(name)
        return name
      }
    }
    throw new Error(`ManagerNamer: exhausted ${nationality} name space`)
  }
}
