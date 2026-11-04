import { modelSpecOf } from './models';

const ctx = {
  prompt: 'Ma robe en wax',
  imageUrl: 'https://files.test/photo.jpg',
  videoUrl: 'https://files.test/ref.mp4',
  format: '9:16',
  resolution: '480p',
};

describe('modelSpecOf', () => {
  it.each([
    'higgsfield/genjutsu-light/motion-transfer/v1.0',
    'higgsfield/genjutsu/motion-transfer/v1.0',
  ])(
    '%s : vidéo de référence + photo, résolution, sans texte ni format',
    (model) => {
      const spec = modelSpecOf(model)!;
      expect(spec).toMatchObject({
        usesPhoto: true,
        needsReferenceVideo: true,
        formats: null,
      });
      expect(spec.build(ctx)).toEqual({
        video_url: ctx.videoUrl,
        image_urls: [ctx.imageUrl],
        resolution: '480p',
      });
      expect(spec.build({ ...ctx, resolution: null })).not.toHaveProperty(
        'resolution',
      );
    },
  );

  it('un modèle inconnu n’est jamais appelé au hasard', () => {
    expect(modelSpecOf('a-definir')).toBeUndefined();
    expect(modelSpecOf('ideogram')).toBeUndefined();
    // Les modèles d'image sont abandonnés : Yamboka ne les appelle plus.
    expect(modelSpecOf('xai/grok-imagine-image-2.0')).toBeUndefined();
    expect(modelSpecOf('higgsfield-ai/soul/v2/standard')).toBeUndefined();
    expect(modelSpecOf('')).toBeUndefined();
  });
});
