"""
计算器模块 - Python 版本
导入 体力、复合、节奏、高速 4个模块进行定数计算
"""

from 体力 import calculate_result
from 复合 import compute_final_composite_difficulty
from 节奏 import compute_final_rhythm_difficulty
from 高速 import compute_weighted_average


def extract_intervals(unbranched):
    """从谱面数据提取间隔数组"""
    intervals = []
    
    if not unbranched or not isinstance(unbranched, list):
        return intervals
    
    for segment in unbranched:
        if segment and isinstance(segment, list):
            for interval in segment:
                if interval is not None and interval > 0:
                    intervals.append(interval)
    
    return intervals


def generate_bn_array(length):
    """生成bn数组（简化版，交替1和2）"""
    bn = []
    for i in range(length):
        bn.append(1 if i % 2 == 0 else 2)
    return bn


def calculate_difficulty_ratings(unbranched):
    """计算单个难度的所有定数"""
    intervals = extract_intervals(unbranched)
    
    if len(intervals) == 0:
        return {'stamina': 0, 'complex': 0, 'complexRatio': 0, 'rhythm': 0, 'rhythmRatio': 0, 'speed': 0}
    
    results = {'stamina': 0, 'complex': 0, 'complexRatio': 0, 'rhythm': 0, 'rhythmRatio': 0, 'speed': 0}
    
    # 计算体力定数
    try:
        _, _, results['stamina'] = calculate_result(intervals)
    except Exception:
        pass
    
    # 计算复合定数（返回 总难度, 难占比）
    try:
        bn = generate_bn_array(len(intervals) + 1)
        results['complex'], results['complexRatio'] = compute_final_composite_difficulty(intervals, bn)
    except Exception:
        pass
    
    # 计算节奏定数（返回 总难度, 难占比）
    try:
        results['rhythm'], results['rhythmRatio'] = compute_final_rhythm_difficulty(intervals)
    except Exception:
        pass
    
    # 计算高速定数
    try:
        results['speed'] = compute_weighted_average(intervals)
    except Exception:
        pass
    
    return results


def calculate_song_charts(song_data):
    """计算歌曲所有谱面分支的定数"""
    charts = []
    
    if not song_data or 'courses' not in song_data:
        return charts
    
    courses = song_data['courses']
    
    for difficulty_name, difficulty_data in courses.items():
        if not difficulty_data or not isinstance(difficulty_data, dict):
            continue
        
        for branch_type, branch_data in difficulty_data.items():
            if not isinstance(branch_data, list):
                continue
            
            ratings = calculate_difficulty_ratings(branch_data)
            charts.append({
                'difficulty': difficulty_name,
                'baseDifficulty': 'oni' if difficulty_name == 'edit' else difficulty_name,
                'isUra': difficulty_name == 'edit',
                'branchType': branch_type,
                'ratings': ratings
            })
    
    return charts


def calculate_batch(songs_with_data, on_progress=None):
    """批量计算多首歌曲"""
    results = []
    processed = 0
    
    for song in songs_with_data:
        try:
            charts = calculate_song_charts(song['data'])
            
            results.append({
                'category': song['category'],
                'songName': song['songName'],
                'charts': charts
            })
        except Exception as error:
            print(f"计算 {song['songName']} 失败: {str(error)}")
            results.append({
                'category': song['category'],
                'songName': song['songName'],
                'charts': [],
                'error': str(error)
            })
        
        processed += 1
        if on_progress:
            on_progress(processed, len(songs_with_data))
    
    return results
