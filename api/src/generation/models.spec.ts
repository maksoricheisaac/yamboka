import { modelSpecOf } from './models';

const ctx = {
  prompt: 'Affiche pour ma robe, texte PROMO -20 %',
  imageUrl: 'https://files.test/photo.jpg',
  videoUrl: 'https://files.test/ref.mp4',
  format: '3:4',
  resolution: '480p',
};

describe('modelSpecOf', () => {
  it('Grok Image 2.0 : envoie la photo, la description et le format, et rien d’autre', () => {
    const spec = modelSpecOf('xai/grok-imagine-image-2.0')!;
    expect(spec).toMatchObject({
      output: 'image',
      usesPhoto: true,
      needsReferenceVideo: false,
    });
    expect(spec.build(ctx)).toEqual({
      prompt: ctx.prompt,
      image_urls: [ctx.imageUrl],
      aspect_ratio: '3:4',
    });
    expect(spec.formats).toEqual([
      '1:1',
      '4:3',
      '3:2',
      '3:4',
      '2:3',
      '16:9',
      '9:16',
    ]);
  });

  it('Soul v2 : texte → image, n’utilise pas la photo et ne la reçoit jamais', () => {
    const spec = modelSpecOf('higgsfield-ai/soul/v2/standard')!;
    expect(spec.usesPhoto).toBe(false);
    expect(spec.build(ctx)).toEqual({
      prompt: ctx.prompt,
      aspect_ratio: '3:4',
    });
    expect(JSON.stringify(spec.build(ctx))).not.toContain('image_urls');
  });

  it.each([
    'higgsfield/genjutsu-light/motion-transfer/v1.0',
    'higgsfield/genjutsu/motion-transfer/v1.0',
  ])(
    '%s : vidéo de référence + photo, résolution, sans texte ni format',
    (model) => {
      const spec = modelSpecOf(model)!;
      expect(spec).toMatchObject({
        output: 'video',
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
    expect(modelSpecOf('')).toBeUndefined();
  });
});
