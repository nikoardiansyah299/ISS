export const earthNightVertexShader = `
  const int MAX_SUN_LIGHTS = 16;
  varying vec2 vUv;
  varying float vNight;
  uniform vec3 lightDirections[MAX_SUN_LIGHTS];
  uniform int lightCount;

  void main() {
    vUv = uv;
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    float maxDot = -1.0;

    for (int i = 0; i < MAX_SUN_LIGHTS; i++) {
      if (i >= lightCount) {
        break;
      }
      float dotNL = dot(worldNormal, normalize(lightDirections[i]));
      if (dotNL > maxDot) {
        maxDot = dotNL;
      }
    }

    vNight = smoothstep(0.0, 0.25, -maxDot);
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
