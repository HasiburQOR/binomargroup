/* =============================================================
   BINOMAR GROUP — valley haze (height fog)
   -------------------------------------------------------------
   Between the foot of the mountain and the distant forest the
   valley floor is open ground, and from the opening view it read
   as an empty moat with a treeline stood round it. Real valleys
   fill with haze, so ours does: the scene's ordinary fog gains a
   second term that thickens near the ground and with distance, so
   the far valley floor and the trunks of the far trees sink into
   mist while the summit, the slopes near the camera and every
   rooftop stay clear. The mist is broken up with a cheap wave
   pattern so it lies in banks rather than as a flat sheet.

   It costs nothing extra to draw: no geometry, no extra pass, just
   a few more instructions in the fog every lit material already
   computes. Call installHeightFog() before any material compiles.
   ============================================================= */
import * as THREE from 'three';

export function installHeightFog({ top = 24, near = 80, far = 340, strength = 0.9 } = {}) {
  const f = (v) => v.toFixed(1);

  THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;

  /* world position from the view-space one: undo the view's rotation
     (its transpose) after taking off its translation — no inverse() */
  THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec3 fogD = mvPosition.xyz - viewMatrix[3].xyz;
  vFogWorld = vec3(dot(viewMatrix[0].xyz, fogD), dot(viewMatrix[1].xyz, fogD), dot(viewMatrix[2].xyz, fogD));
#endif`;

  THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;

  THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  /* the mist's ceiling rises and falls in slow banks */
  float mistBank = 0.72 + 0.28 * sin( vFogWorld.x * 0.029 + sin( vFogWorld.z * 0.021 ) * 2.2 )
                              * sin( vFogWorld.z * 0.025 + 1.3 + sin( vFogWorld.x * 0.017 ) );
  float mist = ( 1.0 - smoothstep( 0.0, ${f(top)} * mistBank, vFogWorld.y ) )
             * smoothstep( ${f(near)}, ${f(far)}, vFogDepth ) * ${strength.toFixed(3)};
  /* after dark the night fog is near-black; mist catches the moonlight,
     so it is lifted a little toward a pale blue (by day this is ~nothing) */
  float fogLum = dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 mistColor = fogColor + vec3( 0.024, 0.031, 0.062 ) * clamp( 1.0 - fogLum * 1.6, 0.0, 1.0 );
  vec3 hazeColor = mix( fogColor, mistColor, mist / max( max( fogFactor, mist ), 1e-4 ) );
  fogFactor = max( fogFactor, mist );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, fogFactor );
#endif`;
}
