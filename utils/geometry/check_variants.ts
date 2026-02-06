import { generateSuspensionHub, SuspensionConfig } from './suspensionHub';

function checkManifold(label: string, vertices: number[], indices: number[]) {
  const edgeCount = new Map<string, number>();
  const directedEdges = new Map<string, number>();

  for (let i = 0; i < indices.length; i += 3) {
    const v = [indices[i], indices[i+1], indices[i+2]];
    const edges = [[v[0],v[1]], [v[1],v[2]], [v[2],v[0]]];
    edges.forEach(([a, b]) => {
      const key = [Math.min(a,b), Math.max(a,b)].join(',');
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      directedEdges.set(`${a},${b}`, (directedEdges.get(`${a},${b}`) || 0) + 1);
    });
  }

  let openEdges = 0, multiEdges = 0, inconsistent = 0;
  edgeCount.forEach((count, edge) => {
    if (count === 1) openEdges++;
    else if (count > 2) multiEdges++;
    if (count === 2) {
      const [v1, v2] = edge.split(',').map(Number);
      const f = directedEdges.get(`${v1},${v2}`) || 0;
      const b = directedEdges.get(`${v2},${v1}`) || 0;
      if (f !== 1 || b !== 1) inconsistent++;
    }
  });
  console.log(`${label}: tris=${indices.length/3} edges=${edgeCount.size} open=${openEdges} non-manifold=${multiEdges} bad-winding=${inconsistent}`);
}

const base: SuspensionConfig = {
  centerY: 7.5, holeRadius: 2.0, hubWidth: 1.0, hubThickness: 0.4,
  spokeCount: 3, spokeWidthMm: 15, spokeWallWidthMm: 15, spokeAngle: 45,
  archDepthFactor: 0.5, flipped: false, spokeHollow: 0, socketDepth: 0,
  socketWall: 0.4, socketChamferAngle: 0, socketChamferDepth: 0.2,
  wallThickness: 0.3, shadeHeight: 15,
  wallRadiusAtY: () => 10,
};

let r = generateSuspensionHub(base, 64);
checkManifold("basic", r.vertices, r.indices);

r = generateSuspensionHub({...base, spokeHollow: 0.5}, 64);
checkManifold("hollow", r.vertices, r.indices);

r = generateSuspensionHub({...base, socketDepth: 2.0}, 64);
checkManifold("socket", r.vertices, r.indices);

r = generateSuspensionHub({...base, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
checkManifold("socket+chamfer", r.vertices, r.indices);

r = generateSuspensionHub({...base, spokeHollow: 0.5, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
checkManifold("everything", r.vertices, r.indices);

r = generateSuspensionHub({...base, flipped: true, spokeHollow: 0.5, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
checkManifold("flipped+everything", r.vertices, r.indices);

r = generateSuspensionHub({...base, spokeCount: 4}, 64);
checkManifold("4-spokes", r.vertices, r.indices);

r = generateSuspensionHub({...base, spokeWidthMm: 5, spokeWallWidthMm: 5}, 64);
checkManifold("narrow", r.vertices, r.indices);

r = generateSuspensionHub({...base, flipped: true, socketDepth: 2.0}, 64);
checkManifold("flipped+socket", r.vertices, r.indices);

r = generateSuspensionHub({...base, flipped: true, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
checkManifold("flipped+socket+chamfer", r.vertices, r.indices);

r = generateSuspensionHub({...base, socketDepth: 2.0, socketWall: 0.2}, 64);
checkManifold("socket+wallEqRim", r.vertices, r.indices);

r = generateSuspensionHub({...base, flipped: true, socketDepth: 2.0, socketWall: 0.2}, 64);
checkManifold("flipped+socket+wallEqRim", r.vertices, r.indices);

r = generateSuspensionHub({...base, socketDepth: 2.0, socketWall: 0.2, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
checkManifold("socket+wallEqRim+chamfer", r.vertices, r.indices);
