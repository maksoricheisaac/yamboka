import { orderBy } from './sort';

describe('orderBy', () => {
  it('ignore une colonne absente de la liste blanche et retombe sur le tri par défaut', () => {
    expect(
      orderBy({ sort: 'password', dir: 'asc' }, ['createdAt', 'email'], {
        field: 'createdAt',
        dir: 'desc',
      }),
    ).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('accepte une colonne autorisée et son sens', () => {
    expect(
      orderBy({ sort: 'email', dir: 'asc' }, ['createdAt', 'email'], {
        field: 'createdAt',
        dir: 'desc',
      }),
    ).toEqual([{ email: 'asc' }, { id: 'asc' }]);
  });

  it('trie en croissant par défaut quand la colonne est autorisée sans sens', () => {
    expect(
      orderBy({ sort: 'email' }, ['createdAt', 'email'], {
        field: 'createdAt',
        dir: 'desc',
      }),
    ).toEqual([{ email: 'asc' }, { id: 'asc' }]);
  });

  it('départage par la clé primaire indiquée : les pays n’ont pas de colonne « id »', () => {
    expect(
      orderBy(
        { sort: 'name', dir: 'desc' },
        ['name', 'iso', 'currency', 'status'],
        { field: 'name', dir: 'asc' },
        'iso',
      ),
    ).toEqual([{ name: 'desc' }, { iso: 'desc' }]);
  });
});
