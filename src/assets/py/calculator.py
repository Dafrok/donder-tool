"""
计算器模块 - Python 版本
导入 体力、复合、节奏、手速、爆发 5个模块进行定数计算
"""

from 体力 import calculate_result
try:
    # 新版复合算法入口
    from 复合 import calculate_complete_compound_difficulty as compute_composite_difficulty
except ImportError:
    # 兼容旧版入口名
    from 复合 import compute_final_composite_difficulty as compute_composite_difficulty
from 节奏 import compute_final_rhythm_difficulty
from 节奏_整体 import compute_final_rhythm_difficulty as compute_overall_rhythm_difficulty
from 手速 import compute_weighted_average as compute_speed_weighted_average
from 手速_95线 import compute_weighted_average as compute_speed95_weighted_average
from 爆发 import compute_weighted_average as compute_burst_weighted_average


def normalize_difficulty_name(difficulty_name):
    mapping = {
        '0': 'easy',
        'easy': 'easy',
        '1': 'normal',
        'normal': 'normal',
        '2': 'hard',
        'hard': 'hard',
        '3': 'oni',
        'oni': 'oni',
        '4': 'edit',
        'edit': 'edit',
    }
    return mapping.get(str(difficulty_name).lower(), str(difficulty_name).lower())


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


def get_note_types_for_chart(song_data, difficulty_name, branch_type):
    """获取某个谱面的音符类型数组（仅1/2）"""
    note_types_map = song_data.get('noteTypes') if isinstance(song_data, dict) else None
    if not isinstance(note_types_map, dict):
        return []

    difficulty_candidates = [difficulty_name, normalize_difficulty_name(difficulty_name)]

    for diff_key in difficulty_candidates:
        diff_entry = note_types_map.get(diff_key)
        if not isinstance(diff_entry, dict):
            continue

        chart_note_types = diff_entry.get(branch_type)
        if isinstance(chart_note_types, list):
            normalized = []
            for v in chart_note_types:
                if v in (1, 3):
                    normalized.append(1)
                elif v in (2, 4):
                    normalized.append(2)
            return normalized

    return []


def count_total_notes(unbranched, note_types=None):
    """统计谱面总 note 数（仅计 1/2/3/4）"""
    if isinstance(note_types, list):
        filtered = [v for v in note_types if v in (1, 2, 3, 4)]
        return len(filtered)

    total = 0
    if not unbranched or not isinstance(unbranched, list):
        return total
    for segment in unbranched:
        if segment and isinstance(segment, list):
            total += len(segment)
    return total


def calculate_difficulty_ratings(unbranched, note_types=None):
    """计算单个难度的所有定数"""
    intervals = extract_intervals(unbranched)
    total_notes = count_total_notes(unbranched, note_types)
    
    if len(intervals) == 0:
        return {
            'stamina': 0,
            'complex': 0,
            'complexRatio': 0,
            'rhythm': 0,
            'rhythmRatio': 0,
            'rhythmOverall': 0,
            'rhythmRatioOverall': 0,
            'speed': 0,
            'speed95': 0,
            'burst': 0,
            'totalNotes': total_notes
        }
    
    results = {
        'stamina': 0,
        'complex': 0,
        'complexRatio': 0,
        'rhythm': 0,
        'rhythmRatio': 0,
        'rhythmOverall': 0,
        'rhythmRatioOverall': 0,
        'speed': 0,
        'speed95': 0,
        'burst': 0,
        'totalNotes': total_notes
    }
    
    # 计算体力定数
    try:
        _, _, results['stamina'] = calculate_result(intervals)
    except Exception:
        pass
    
    # 计算复合定数（返回 总难度, 难占比）
    try:
        if note_types and isinstance(note_types, list):
            bn = []
            for v in note_types:
                if v in (1, 3):
                    bn.append(1)
                elif v in (2, 4):
                    bn.append(2)
            if len(bn) < len(intervals) + 1:
                bn.extend(generate_bn_array(len(intervals) + 1 - len(bn)))
            elif len(bn) > len(intervals) + 1:
                bn = bn[:len(intervals) + 1]
        else:
            bn = generate_bn_array(len(intervals) + 1)

        results['complex'], results['complexRatio'] = compute_composite_difficulty(intervals, bn)
    except Exception:
        pass
    
    # 计算节奏定数（返回 总难度, 难占比）
    try:
        results['rhythm'], results['rhythmRatio'] = compute_final_rhythm_difficulty(intervals)
    except Exception:
        pass

    # 计算节奏定数（整体算法，返回 总难度, 难占比）
    try:
        results['rhythmOverall'], results['rhythmRatioOverall'] = compute_overall_rhythm_difficulty(intervals)
    except Exception:
        pass
    
    # 计算手速定数（手速算法）
    try:
        results['speed'] = compute_speed_weighted_average(intervals)
    except Exception:
        pass

    # 计算手速定数（95线算法）
    try:
        results['speed95'] = compute_speed95_weighted_average(intervals)
    except Exception:
        pass

    # 计算爆发定数（爆发算法）
    try:
        results['burst'] = compute_burst_weighted_average(intervals)
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

        normalized_difficulty = normalize_difficulty_name(difficulty_name)
        
        for branch_type, branch_data in difficulty_data.items():
            if not isinstance(branch_data, list):
                continue

            note_types = get_note_types_for_chart(song_data, difficulty_name, branch_type)
            
            ratings = calculate_difficulty_ratings(branch_data, note_types)
            charts.append({
                'difficulty': normalized_difficulty,
                'baseDifficulty': 'oni' if normalized_difficulty == 'edit' else normalized_difficulty,
                'isUra': normalized_difficulty == 'edit',
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
