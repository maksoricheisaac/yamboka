import { isDisposableEmail } from './disposable-domains';

describe('isDisposableEmail', () => {
  it.each([
    'a@mailinator.com',
    'a@YOPMAIL.com',
    'a@sub.mailinator.com',
    'a@guerrillamail.net',
  ])('refuse %s', (email) => expect(isDisposableEmail(email)).toBe(true));

  it.each([
    'a@gmail.com',
    'a@yahoo.fr',
    'a@entreprise.cg',
    'a@notmailinator.com',
  ])('accepte %s', (email) => expect(isDisposableEmail(email)).toBe(false));

  it('ne plante pas sur une adresse mal formée', () => {
    expect(isDisposableEmail('sans-arobase')).toBe(false);
  });
});
