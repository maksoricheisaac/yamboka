import { modelSpecOf } from './models';

const ctx = {
  prompt: 'La caméra tourne lentement autour des chaussures.',
  imageUrl: 'https://files.test/photo.jpg',
  format: '9:16',
  resolution: '480p',
  durationSeconds: 5,
  audio: true,
};

describe('modelSpecOf', () => {
  it('Wan 3.0 image → vidéo : envoie la photo, le texte, la durée, la résolution, le format et l’audio, rien d’autre', () => {
    const spec = modelSpecOf('alibaba/wan-3.0/image-to-video')!;
    expect(spec.build(ctx)).toEqual({
      prompt: ctx.prompt,
      image_url: ctx.imageUrl,
      duration: 5,
      resolution: '480p',
      aspect_ratio: '9:16',
      generate_audio: true,
    });
  });

  it('envoie toujours la résolution et peut couper le son', () => {
    const spec = modelSpecOf('alibaba/wan-3.0/image-to-video')!;
    expect(
      spec.build({ ...ctx, resolution: '1080p', audio: false }),
    ).toMatchObject({
      resolution: '1080p',
      generate_audio: false,
    });
  });

  it('un modèle inconnu n’est jamais appelé au hasard (Genjutsu, images, Prime non exposé)', () => {
    for (const m of [
      'a-definir',
      '',
      'higgsfield/genjutsu-light/motion-transfer/v1.0',
      'higgsfield/genjutsu-light/object-swap/v1.0',
      'xai/grok-imagine-image-2.0',
      'alibaba/wan-3.0-prime/image-to-video',
    ])
      expect(modelSpecOf(m)).toBeUndefined();
  });
});
