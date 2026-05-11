export const earthNightVertexShader = `
  varying vec2 vUv;
  varying float vNight;
  uniform vec3 lightDirection;

  void main() {
    vUv = uv;
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    float dotNL = dot(worldNormal, normalize(lightDirection));
    vNight = smoothstep(0.0, 0.25, -dotNL);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const earthNightFragmentShader = `
  uniform sampler2D nightMap;
  uniform float intensity;
  varying vec2 vUv;
  varying float vNight;

  void main() {
    vec3 color = texture2D(nightMap, vUv).rgb * intensity;
    gl_FragColor = vec4(color * vNight, vNight);
  }
`;
