export const sunVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const sunFragmentShader = `
  uniform sampler2D uTexture;
  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uUseTexture;
  uniform float uAlpha;
  uniform float uCorona;

  varying vec2 vUv;

  void main() {
    vec2 centered = vUv - 0.5;
    float r = length(centered) * 2.0;
    float grad = smoothstep(0.0, 1.0, r);
    float ripple = 0.015 * sin(10.0 * r - uTime * 1.2);
    grad = clamp(grad + ripple, 0.0, 1.0);

    vec3 color = mix(uInnerColor, uOuterColor, grad);
    vec3 tex = texture2D(uTexture, vUv).rgb;
    color = mix(color, color * (0.75 + tex.r * 0.6), uUseTexture);

    float edge = smoothstep(0.25, 1.0, r);
    float fade = 1.0 - smoothstep(0.7, 1.0, r);
    float coronaAlpha = edge * fade;
    float alpha = mix(1.0, coronaAlpha, uCorona) * uAlpha;

    gl_FragColor = vec4(color * uIntensity, alpha);
  }
`;
