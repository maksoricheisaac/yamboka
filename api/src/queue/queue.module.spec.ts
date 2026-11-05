import { areProcessorsEnabled } from './queue.module';

describe('areProcessorsEnabled', () => {
  const previous = process.env.RUN_PROCESSORS;
  afterEach(() => {
    if (previous === undefined) delete process.env.RUN_PROCESSORS;
    else process.env.RUN_PROCESSORS = previous;
  });

  it('est actif par défaut : comportement actuel conservé', () => {
    delete process.env.RUN_PROCESSORS;
    expect(areProcessorsEnabled()).toBe(true);
  });

  it('ne se désactive que par la valeur explicite « false »', () => {
    process.env.RUN_PROCESSORS = 'false';
    expect(areProcessorsEnabled()).toBe(false);
    process.env.RUN_PROCESSORS = 'true';
    expect(areProcessorsEnabled()).toBe(true);
  });
});
