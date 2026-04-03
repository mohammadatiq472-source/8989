using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace SLGCommander
{
    /// <summary>
    /// Main HUD — dark-gold SLG aesthetic.
    /// Wires up:
    ///   • Top bar: Tick / Food / AP / AI quota
    ///   • Tile info panel (bottom-left fly-in)
    ///   • Advance-tick button
    /// All UI references are optional; missing refs are silently ignored.
    /// </summary>
    public class GameHUD : MonoBehaviour
    {
        // ── Top Bar ───────────────────────────────────────────────────────

        [Header("Top Bar")]
        public TextMeshProUGUI tickLabel;
        public TextMeshProUGUI foodLabel;
        public TextMeshProUGUI apLabel;
        public TextMeshProUGUI loadingLabel;
        public TextMeshProUGUI quotaNoticeLabel;

        // ── Tile Info Panel ───────────────────────────────────────────────

        [Header("Tile Info")]
        public GameObject      tileInfoRoot;
        public TextMeshProUGUI tileNameLabel;
        public TextMeshProUGUI tileTerrainLabel;
        public TextMeshProUGUI tileOwnerLabel;
        public TextMeshProUGUI tileCoordLabel;

        // ── Unit Info ─────────────────────────────────────────────────────

        [Header("Unit Info")]
        public GameObject      unitInfoRoot;
        public TextMeshProUGUI unitNameLabel;
        public TextMeshProUGUI unitStatusLabel;
        public TextMeshProUGUI unitStrengthLabel;
        public TextMeshProUGUI heroQualityLabel;

        // ── Buttons ───────────────────────────────────────────────────────

        [Header("Buttons")]
        public Button advanceTickBtn;
        public Button refreshBtn;

        // ── Unity lifecycle ───────────────────────────────────────────────

        private bool _eventsBound;
        private GameManager _boundGameManager;
        void Start()
        {
            BindEvents();

            var gm = GameManager.Instance;
            if (gm != null)
            {
                advanceTickBtn?.onClick.AddListener(gm.AdvanceTick);
                refreshBtn?.onClick.AddListener(gm.Refresh);
                if (gm.World != null)
                    RefreshTopBar(gm.World);
            }

            tileInfoRoot?.SetActive(false);
            unitInfoRoot?.SetActive(false);
        }

        void OnEnable()
        {
            BindEvents();
        }

        void OnDisable()
        {
            UnbindEvents();
            ClearQuotaNotice();
        }

        void OnDestroy()
        {
            UnbindEvents();
        }

        void Update()
        {
            if (loadingLabel && GameManager.Instance)
                loadingLabel.gameObject.SetActive(GameManager.Instance.Loading);
            if (quotaNoticeLabel && _quotaNoticeHideAt > 0f && Time.time >= _quotaNoticeHideAt)
                ClearQuotaNotice();
        }

        // ── Top Bar ───────────────────────────────────────────────────────

        private void RefreshTopBar(WorldState world)
        {
            if (world == null) return;
            if (tickLabel) tickLabel.text = $"第 {world.tick} 轮";

            var fac = GameManager.Instance.PlayerFaction;
            if (fac != null)
            {
                if (foodLabel) foodLabel.text  = $"粮 {fac.food:F0}";
                if (apLabel)
                {
                    string apText = $"AP {fac.actionPoints:F0}";
                    if (fac.aiQuota != null)
                        apText += $" · AI {fac.aiQuota.currentQuota}/{fac.aiQuota.maxQuota}";
                    apLabel.text = apText;
                }
            }
        }

        private float _quotaNoticeHideAt = -1f;

        private void BindEvents()
        {
            if (_eventsBound) return;

            var gm = GameManager.Instance;
            if (gm == null) return;

            gm.OnWorldUpdated += RefreshTopBar;
            gm.OnTileSelected += ShowTileInfo;
            gm.OnUnitSelected += ShowUnitInfo;
            gm.OnAiQuotaChanged += HandleAiQuotaChanged;

            _boundGameManager = gm;
            _eventsBound = true;
        }

        private void UnbindEvents()
        {
            if (!_eventsBound) return;

            var gm = _boundGameManager;
            if (gm != null)
            {
                gm.OnWorldUpdated -= RefreshTopBar;
                gm.OnTileSelected -= ShowTileInfo;
                gm.OnUnitSelected -= ShowUnitInfo;
                gm.OnAiQuotaChanged -= HandleAiQuotaChanged;
            }

            _boundGameManager = null;
            _eventsBound = false;
        }

        private void ClearQuotaNotice()
        {
            _quotaNoticeHideAt = -1f;
            if (quotaNoticeLabel)
                quotaNoticeLabel.text = string.Empty;
            SetQuotaNoticeVisible(false);
        }

        private void HandleAiQuotaChanged(AiQuotaChangeNotice notice)
        {
            if (notice == null || notice.currentQuota == notice.previousQuota) return;
            if (!quotaNoticeLabel) return;
            if (!ShouldDisplayQuotaNotice(notice))
                return;

            int delta = notice.currentQuota - notice.previousQuota;
            bool isExpansion = delta > 0;
            quotaNoticeLabel.color = isExpansion
                ? new Color(0.94f, 0.78f, 0.45f, 1f)
                : new Color(0.88f, 0.42f, 0.30f, 1f);
            quotaNoticeLabel.text =
                $"{(isExpansion ? "协作席位扩容" : "协作席位收缩")}：{notice.previousQuota} → {notice.currentQuota}/{notice.maxQuota} " +
                $"(Δ{delta:+0;-0;0}, 拉锯 {notice.tugIntensity}, 成长 {notice.growthScore})";
            SetQuotaNoticeVisible(true);
            _quotaNoticeHideAt = Time.time + 6f;
            if (GameManager.Instance?.World != null) RefreshTopBar(GameManager.Instance.World);
        }

        private static bool ShouldDisplayQuotaNotice(AiQuotaChangeNotice notice)
        {
            var gm = GameManager.Instance;
            if (gm == null) return false;

            var playerFactionId = gm.playerFactionId?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(playerFactionId)) return true;

            return string.Equals(notice.factionId, playerFactionId, StringComparison.OrdinalIgnoreCase);
        }

        private void SetQuotaNoticeVisible(bool visible)
        {
            var root = quotaNoticeLabel ? quotaNoticeLabel.transform.parent?.gameObject : null;
            if (root != null)
                root.SetActive(visible);
        }

        // ── Tile Info ─────────────────────────────────────────────────────

        private void ShowTileInfo(Tile tile)
        {
            if (tileInfoRoot == null) return;
            if (tile == null) { tileInfoRoot.SetActive(false); return; }

            tileInfoRoot.SetActive(true);

            string displayName = !string.IsNullOrEmpty(tile.landmarkName)
                ? tile.landmarkName
                : !string.IsNullOrEmpty(tile.name) ? tile.name : $"({tile.x},{tile.y})";

            if (tileNameLabel)    tileNameLabel.text    = displayName;
            if (tileTerrainLabel) tileTerrainLabel.text = TerrainDisplayName(tile.terrain);
            if (tileOwnerLabel)   tileOwnerLabel.text   =
                string.IsNullOrEmpty(tile.owner) ? "无主" : tile.owner;
            if (tileCoordLabel)   tileCoordLabel.text   = $"{tile.x},{tile.y}";
        }

        // ── Unit Info ─────────────────────────────────────────────────────

        private void ShowUnitInfo(Unit unit)
        {
            if (unitInfoRoot == null) return;
            if (unit == null) { unitInfoRoot.SetActive(false); return; }

            unitInfoRoot.SetActive(true);

            if (unitNameLabel)     unitNameLabel.text     = unit.name;
            if (unitStatusLabel)   unitStatusLabel.text   = unit.status;
            if (unitStrengthLabel) unitStrengthLabel.text = $"兵力 {unit.strength:F0}%";
            if (heroQualityLabel && unit.hero != null)
                heroQualityLabel.text = $"{unit.hero.name} [{unit.hero.quality}]";
        }

        // ── Helpers ───────────────────────────────────────────────────────

        private static string TerrainDisplayName(string t) => t switch
        {
            "grassland" => "平原", "forest"    => "林地",
            "highland"  => "高地", "mountain"  => "山地",
            "riverland" => "水域", "urban"     => "城市",
            "wasteland" => "荒野", _           => t,
        };
    }
}
