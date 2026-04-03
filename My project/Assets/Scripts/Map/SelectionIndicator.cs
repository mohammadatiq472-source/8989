using UnityEngine;
using UnityEngine.Rendering;

namespace SLGCommander
{
    /// <summary>
    /// Draws a gold diamond highlight around the currently selected tile.
    /// Lives at sorting order 2 so it renders above terrain chunks (order 0).
    /// Uses the same VertexColor shader as the terrain.
    /// </summary>
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class SelectionIndicator : MonoBehaviour
    {
        private MeshRenderer _mr;
        private Material     _runtimeMaterial;

        void Awake()
        {
            // Build the diamond mesh slightly larger than one tile
            float hw = ChunkedMapRenderer.HALF_W * 1.07f;
            float hh = ChunkedMapRenderer.HALF_H * 1.07f;

            var gold = new Color(0.96f, 0.79f, 0.46f);   // accent gold
            var dark = new Color(0.00f, 0.00f, 0.00f);   // black gap ring

            // Outer ring (darker) + inner fill (gold) — two nested diamonds
            var outerVerts = new Vector3[]
            {
                new(0f,    hh,  -0.1f), new(hw,   0f,  -0.1f),
                new(0f,   -hh,  -0.1f), new(-hw,  0f,  -0.1f),
            };
            var innerVerts = new Vector3[]
            {
                new(0f,    hh * 0.82f, -0.2f), new(hw * 0.82f,  0f,  -0.2f),
                new(0f,   -hh * 0.82f, -0.2f), new(-hw * 0.82f, 0f,  -0.2f),
            };

            var allVerts   = new Vector3[8];
            var allColors  = new Color[8];
            outerVerts.CopyTo(allVerts, 0);
            innerVerts.CopyTo(allVerts, 4);

            for (int i = 0; i < 4; i++) allColors[i]     = dark * 0.5f + gold * 0.5f;
            for (int i = 4; i < 8; i++) allColors[i]     = gold;

            var tris = new int[]
            {
                // Outer diamond (ring glow)
                0,1,2,  0,2,3,
                // Inner diamond (fill)
                4,5,6,  4,6,7,
            };

            var mesh = new Mesh { name = "SelectionDiamond" };
            mesh.vertices  = allVerts;
            mesh.colors    = allColors;
            mesh.triangles = tris;
            mesh.RecalculateBounds();

            GetComponent<MeshFilter>().mesh = mesh;

            _mr = GetComponent<MeshRenderer>();
            var shader = Shader.Find("Custom/VertexColor") ?? Shader.Find("Sprites/Default");
            _runtimeMaterial     = new Material(shader) { name = "SelectionMat_Runtime_Instance" };
            _mr.sharedMaterial   = _runtimeMaterial;
            _mr.shadowCastingMode = ShadowCastingMode.Off;
            _mr.receiveShadows   = false;
            _mr.sortingOrder     = 2;

            gameObject.SetActive(false);
        }

        void Start()
        {
            if (GameManager.Instance)
                GameManager.Instance.OnTileSelected += OnTileSelected;
        }

        void OnDestroy()
        {
            if (GameManager.Instance)
                GameManager.Instance.OnTileSelected -= OnTileSelected;

            if (_runtimeMaterial != null)
            {
                Destroy(_runtimeMaterial);
                _runtimeMaterial = null;
            }
        }

        private void OnTileSelected(Tile tile)
        {
            if (tile == null) { gameObject.SetActive(false); return; }
            transform.position = ChunkedMapRenderer.GridToWorld(tile.x, tile.y);
            gameObject.SetActive(true);
        }
    }
}
