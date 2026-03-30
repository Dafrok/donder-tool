import React from 'react';
import {
  Body1,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem
} from '@fluentui/react-components';

function getDifficultyColor(difficulty) {
  const colors = {
    easy: '#cf202f',
    normal: '#4d7f2f',
    hard: '#005a9c',
    oni: '#8f1d4f',
    edit: '#5c2d91'
  };
  return colors[difficulty] || '#475467';
}

function getBranchColor(branchType) {
  const colors = {
    normal: '#667085',
    expert: '#0078d4',
    master: '#b42318'
  };
  return colors[branchType] || '#667085';
}

function formatRatingValue(value) {
  if (value === 0 || !value) return '-';
  return Number(value).toFixed(2);
}

function formatRatingWithRatio(value, ratio) {
  const valueText = formatRatingValue(value);
  const ratioText = formatRatingValue(ratio);
  if (ratioText === '-') return valueText;
  return `${valueText} (${ratioText})`;
}

function formatGapThreshold(value) {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toFixed(1);
}

function ChartDetailPage({ detail, onBack }) {
  const statItems = detail?.stats ? [
    { label: '音符总数', value: detail.stats.totalNotes },
    { label: '平均间隔', value: `${detail.stats.avgGap} ms` },
    { label: '间隔中位数', value: `${detail.stats.medianGap} ms` },
    { label: '最小间隔', value: `${detail.stats.minGap} ms` },
    {
      label: '最高频间隔',
      value: detail.stats.modeGap === '-'
        ? '-'
        : `${detail.stats.modeGap} ms (${detail.stats.modeGapCount} 次)`
    },
    {
      label: '次高频间隔',
      value: detail.stats.secondModeGap === '-'
        ? '-'
        : `${detail.stats.secondModeGap} ms (${detail.stats.secondModeGapCount} 次)`
    }
  ] : [];

  const ratingItems = detail?.ratings ? [
    { label: '体力', value: detail.ratings.stamina },
    { label: '手速', value: detail.ratings.speed },
    { label: '爆发', value: detail.ratings.burst },
    { label: '复合', value: formatRatingWithRatio(detail.ratings.complex, detail.ratings.complexRatio) },
    { label: '节奏', value: formatRatingWithRatio(detail.ratings.rhythm, detail.ratings.rhythmRatio) }
  ] : [];

  const gapProfile = detail?.stats?.gapSpeedProfile || null;
  const fastMax = formatGapThreshold(gapProfile?.fastMax);
  const mediumMax = formatGapThreshold(gapProfile?.mediumMax);
  const normalMax = formatGapThreshold(gapProfile?.normalMax);

  return (
    <div className="results-panel chart-detail-panel">
      <header className="chart-detail-header" aria-label="谱面详情导航">
        <Breadcrumb className="list-breadcrumb" aria-label="谱面详情面包屑">
          <BreadcrumbItem>
            <BreadcrumbButton onClick={onBack}>谱面分析</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            <BreadcrumbButton className="chart-breadcrumb-song" current aria-current="page">
              <span className="chart-breadcrumb-song-text">{detail?.songName || '未知歌曲'}</span>
            </BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>
      </header>

      <div className="chart-detail-body">
        {detail ? (
          <div className="chart-detail-grid">
            <div className="chart-detail-left-column">
              <section className="chart-detail-card chart-detail-stats-card" aria-label="概览">
                <h3 className="chart-detail-card-title">概览</h3>

                {(detail?.diffLabel || detail?.branchLabel || detail?.stats) ? (
                  <div className="chart-detail-stats-grid">
                    {(detail?.diffLabel || detail?.level || detail?.branchLabel) && (
                      <>
                        <div className="chart-detail-stat-block chart-detail-basic-info">
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '14px' }}>
                            <div style={{ color: getDifficultyColor(detail.difficulty), fontWeight: 700 }}>
                              {detail.diffLabel}
                            </div>
                            {detail.level && (
                              <div style={{ color: '#1f4f71' }}>
                                ★{detail.level}
                              </div>
                            )}
                            {detail.branchLabel && (
                              <div style={{ color: getBranchColor(detail.branchType), fontWeight: 600 }}>
                                {detail.branchLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                    {statItems.map((item) => (
                        <div
                          className={`chart-detail-stat-block ${item.label.includes('频间隔') ? 'chart-detail-stat-block-wide' : ''}`}
                          key={item.label}
                        >
                        <span className="chart-detail-stat-label">{item.label}</span>
                        <span className="chart-detail-stat-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Body1 className="hint">无可用的概要数据</Body1>
                )}
              </section>

              <section className="chart-detail-card chart-detail-ratings-card" aria-label="定数">
                <h3 className="chart-detail-card-title">定数</h3>
                {ratingItems.length ? (
                  <div className="chart-detail-ratings-grid">
                    {ratingItems.map((item) => (
                      <div className="chart-detail-stat-block chart-detail-rating-block" key={item.label}>
                        <span className="chart-detail-stat-label">{item.label}</span>
                        <span className="chart-detail-stat-value">
                          {typeof item.value === 'string' ? item.value : formatRatingValue(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Body1 className="hint">暂无可用定数数据</Body1>
                )}
              </section>
            </div>

            <section className="chart-detail-card chart-detail-gaps-card" aria-label="音符间隔明细">
              <h3 className="chart-detail-card-title">音符间隔明细</h3>
              <div className="chart-gap-legend" aria-label="间隔颜色说明">
                <span className="gap-value gap-fast">快速 ≤{fastMax}ms</span>
                <span className="gap-value gap-medium">中速 {fastMax}-{mediumMax}ms</span>
                <span className="gap-value gap-normal">常规 {mediumMax}-{normalMax}ms</span>
                <span className="gap-value gap-slow">慢速 {'>'}{normalMax}ms</span>
                <span className="gap-value gap-null">空值 -</span>
              </div>
              {detail.bars.length ? (
                <div className="gap-list chart-gap-list">
                  {detail.bars.map((bar) => (
                    <div className="gap-bar" key={bar.label}>
                      <span className="gap-bar-label">{bar.label}</span>
                      <div className="gap-bar-values">
                        {bar.values.length ? (
                          bar.values.map((value, idx) => (
                            <span className={`gap-value ${value.className}`} key={`${bar.label}-${idx}`}>
                              {value.text}
                            </span>
                          ))
                        ) : (
                          <span className="gap-value gap-null" key={`${bar.label}-placeholder`}>
                            -
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Body1 className="hint">该谱面暂无可展示的小节间隔数据。</Body1>
              )}
            </section>
          </div>
        ) : (
          <div className="chart-detail-card chart-detail-empty">
            <Body1 className="hint">未找到对应谱面详情，请从列表重新进入。</Body1>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChartDetailPage;
