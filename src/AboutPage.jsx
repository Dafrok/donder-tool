import React from 'react';
import {
  Body1,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbItem,
  Link
} from '@fluentui/react-components';

function AboutPage({ footerInfo, isOffline, onBack }) {
  return (
    <div className="results-panel">
      <header className="list-caption" aria-label="关于页面导航">
        <Breadcrumb className="list-breadcrumb" aria-label="关于页面面包屑">
          <BreadcrumbItem>
            <BreadcrumbButton current aria-current="page">关于</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>
      </header>
      <div className="table-wrapper" style={{ padding: 16 }}>
        <Body1>
          Donder Tools 是一个面向太鼓谱面的分析与速算工具集合，支持导入 TJA 谱面并快速查看多维度结果。
        </Body1>
        <Body1 style={{ marginTop: 8 }}>
          在“数据分析”中，你可以上传或拖拽文件夹批量导入谱面，使用搜索与筛选定位歌曲，并将分析结果导出为 CSV。
        </Body1>
        <Body1 style={{ marginTop: 8 }}>
          在“出勤工具”中，你可以使用单曲价格速算与目标成绩速算，快速完成日常计算。
        </Body1>
        <div className="about-meta" style={{ marginTop: 12 }}>
          <div className="about-meta-line">部署时间: {footerInfo.timeStr}</div>
          <div className="about-meta-line">
            版本:
            {' '}
            <Link href={`https://github.com/Dafrok/donder-tool/commit/${footerInfo.hash}`} target="_blank" rel="noreferrer">
              {footerInfo.hash}
            </Link>
          </div>
          <div className="about-meta-line">
            网络状态:
            {' '}
            <span className={`network-status ${isOffline ? 'is-offline' : 'is-online'}`}>
              {isOffline ? '网络不可达' : '网络可达'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;
