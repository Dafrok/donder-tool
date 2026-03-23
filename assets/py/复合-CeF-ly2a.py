import math
from typing import List, Tuple, Optional

def calculate_compound_difficulty(an: List[float], bn: List[int], T: float) -> float:
    """
    计算复合难度（核心算法）
    
    Args:
        an: 数组a，元素为浮点数
        bn: 数组b，只包含1和2，长度比an多1
        T: 阈值参数
        
    Returns:
        总的复合难度
    """
    # 步骤1: 在an最后补一个0
    an_extended = an.copy()
    an_extended.append(0.0)
    
    # 确保bn长度正确
    if len(bn) != len(an) + 1:
        raise ValueError(f"bn的长度应为{len(an) + 1}，但实际为{len(bn)}")
    
    # 步骤2: 标记LR标记
    n = len(an_extended)
    lr_marks = ['R'] * n
    
    for i in range(1, n):
        if lr_marks[i-1] == 'R' and an_extended[i-1] < T:
            lr_marks[i] = 'L'
        else:
            lr_marks[i] = 'R'
    
    # 步骤3-10: 提取子数组并计算复合难度
    total_compound_difficulty = 0.0
    current_index = 0
    
    while current_index < n:
        # 步骤3: 提取满足RLRL循环的子数组
        subarray_indices = []
        
        # 第一个元素必须是'R'
        if lr_marks[current_index] != 'R':
            current_index += 1
            continue
        
        i = current_index
        expected_mark = 'R'
        
        while i < n:
            if lr_marks[i] != expected_mark:
                # 检查是否因为连续两个R而停止
                if i < n and lr_marks[i] == 'R' and lr_marks[i-1] == 'R':
                    subarray_indices.append(i-1)
                break
            
            subarray_indices.append(i)
            expected_mark = 'L' if expected_mark == 'R' else 'R'
            i += 1
        
        if not subarray_indices:
            current_index += 1
            continue
        
        # 步骤4: 检查子数组长度
        subarray_len = len(subarray_indices)
        
        if subarray_len < 6:
            current_index = subarray_indices[-1] + 1
            continue
        
        # 步骤5: 标记换手标记和同步标记
        handover_marks = [None] * subarray_len
        sync_marks = [None] * subarray_len
        
        # 计算换手标记
        for j in range(2, subarray_len):
            idx_current = subarray_indices[j]
            idx_prev_same = subarray_indices[j-2]
            
            if bn[idx_current] != bn[idx_prev_same]:
                handover_marks[j] = 1
            else:
                handover_marks[j] = 0
        
        # 计算同步标记
        for j in range(4, subarray_len):
            if handover_marks[j] is not None and handover_marks[j-2] is not None:
                if handover_marks[j] == handover_marks[j-2]:
                    sync_marks[j] = 1
                else:
                    sync_marks[j] = 0
        
        # 步骤6-8: 计算复合难度
        subarray_compound_difficulty = 0.0
        
        for j in range(5, subarray_len):
            # 步骤6: 计算基础系数a
            if sync_marks[j] is not None and sync_marks[j-1] is not None:
                a = 0 if sync_marks[j] == sync_marks[j-1] else 1
            else:
                a = 0
            
            # 步骤7: 计算系数b
            idx_i = subarray_indices[j]
            
            def get_large_interval_correction(X: float) -> float:
                threshold_low = 30/130 * 1000 * 1.5
                threshold_high = 30/90 * 1000 * 1.5
                
                if X <= threshold_low:
                    return 1.0
                elif X >= threshold_high:
                    return 0.0
                else:
                    return 1.0 - (X - threshold_low) / (threshold_high - threshold_low)
            
            # 计算b
            if idx_i - 1 >= 0 and idx_i - 2 >= 0:
                X1 = an_extended[idx_i-1] + an_extended[idx_i-2]
                corr1 = get_large_interval_correction(X1)
            else:
                corr1 = 0.0
            
            if idx_i - 2 >= 0 and idx_i - 3 >= 0:
                X2 = an_extended[idx_i-2] + an_extended[idx_i-3]
                corr2 = get_large_interval_correction(X2)
            else:
                corr2 = 0.0
            
            b = corr1 * corr2

            # 新增: 步骤8: 计算系数c
            # 1. 获取当前元素的LR标记
            current_lr_mark = lr_marks[idx_i]  # 通过原始索引获取LR标记

            c = 1.0  # 默认值

            # 当前元素的标记必须为"L"才进行详细计算
            if current_lr_mark == 'L':
                # 2. 计算阈值边界
                lower_limit = 15/300 * 1000  # 约为 50.0
                upper_limit = 15/220 * 1000  # 约为 68.18
                value_to_check = an_extended[idx_i-1]  # 当前元素前一个位置的值
                
                # 3. 根据 value_to_check 与阈值的关系计算c
                if value_to_check > upper_limit:
                    c = 0.0
                elif value_to_check < lower_limit:
                    c = 1.0
                else:
                    # 线性插值
                    c = 1.0 - (value_to_check - lower_limit) / (upper_limit - lower_limit)
            # 如果标记是'R'，c保持为1.0

            
            # 计算当前元素的复合难度
            element_difficulty = a * b * c
            subarray_compound_difficulty += element_difficulty
        
        #  乘以ln(子数组长度)
      #  if subarray_compound_difficulty > 0:
      #      subarray_compound_difficulty *= math.log(subarray_len)
        
        total_compound_difficulty += subarray_compound_difficulty
        current_index = subarray_indices[-1] + 1
    
    return total_compound_difficulty

def calculate_complete_compound_difficulty(an: List[float], bn: List[int]) -> Tuple[float, float]:
    """
    完整的复合难度计算方法
    
    Args:
        an: 数组a
        bn: 数组b，长度比an多1
        
    Returns:
        (最终复合难度, 复合难度占比)
    """
    # 计算阈值边界
    lower_bound = 30/260 * 1000
    upper_bound = 30/180 * 1000
    
    # 查找在指定范围内的数
    numbers_in_range = [x for x in an if lower_bound < x < upper_bound]
    
    if not numbers_in_range:
        # 情况1: 没有满足条件的数
        T = 30/180 * 1000
        compound_difficulty = calculate_compound_difficulty(an, bn, T)
    else:
        # 情况2: 有满足条件的数
        # 步骤1: 准备阈值列表
        t0 = 30/180 * 1000
        tm = 30/260 * 1000
        
        # 去重并排序
        unique_numbers = sorted(list(set(numbers_in_range)), reverse=True)
        
        # 从大到小排列: t0, t1, t2, ..., tn
        thresholds = [t0] + unique_numbers
        
        # 步骤2: 计算各个阈值对应的复合难度
        difficulties = []
        for T in thresholds:
            difficulty = calculate_compound_difficulty(an, bn, T)
            difficulties.append(difficulty)
        
        # 步骤3: 计算权重
        weights = []
        
        # 计算w0, w1, ..., w(n-1)
        for i in range(len(thresholds) - 1):
            w = 1/thresholds[i+1] - 1/thresholds[i]
            weights.append(w)
        
        # 计算wn: 1/tm - 1/tn
        w_last = 1/tm - 1/thresholds[-1]
        weights.append(w_last)
        
        # 步骤4: 计算加权平均值
        weighted_sum = 0.0
        total_weight = 0.0
        
        for i in range(len(difficulties)):
            weighted_sum += difficulties[i] * weights[i]
            total_weight += weights[i]
        
        if total_weight > 0:
            compound_difficulty = weighted_sum / total_weight
        else:
            compound_difficulty = 0.0
    
    # 步骤5: 计算复合难度占比
    difficulty_ratio = compound_difficulty / len(an) if len(an) > 0 else 0.0
    
    return compound_difficulty, difficulty_ratio

def test_complete_calculation():
    """测试完整计算方法"""
    
    print("=== 测试完整复合难度计算 ===")
    
    # 测试用例1: 有满足条件的数
    print("\n测试用例1: 有在范围内的数")
    an1 = [50.0, 120.0, 150.0, 180.0, 200.0, 130.0, 140.0, 160.0, 170.0]
    bn1 = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]
    
    # 计算边界
    lower_bound = 30/260 * 1000
    upper_bound = 30/180 * 1000
    print(f"范围: ({lower_bound:.2f}, {upper_bound:.2f})")
    print(f"an1中在范围内的数: {[x for x in an1 if lower_bound < x < upper_bound]}")
    
    difficulty1, ratio1 = calculate_complete_compound_difficulty(an1, bn1)
    print(f"最终复合难度: {difficulty1:.4f}")
    print(f"复合难度占比: {ratio1:.4f}")
    
    # 测试用例2: 没有满足条件的数
    print("\n测试用例2: 没有在范围内的数")
    an2 = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
    bn2 = [1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2]
    
    print(f"范围: ({lower_bound:.2f}, {upper_bound:.2f})")
    print(f"an2中在范围内的数: {[x for x in an2 if lower_bound < x < upper_bound]}")
    
    difficulty2, ratio2 = calculate_complete_compound_difficulty(an2, bn2)
    print(f"最终复合难度: {difficulty2:.4f}")
    print(f"复合难度占比: {ratio2:.4f}")
    
    # 测试用例3: 边界情况
    print("\n测试用例3: 边界情况（空数组）")
    an3 = []
    bn3 = [1]
    
    try:
        difficulty3, ratio3 = calculate_complete_compound_difficulty(an3, bn3)
        print(f"最终复合难度: {difficulty3:.4f}")
        print(f"复合难度占比: {ratio3:.4f}")
    except Exception as e:
        print(f"错误: {e}")
    
    # 测试用例4: 复杂情况
    print("\n测试用例4: 复杂情况")
    an4 = [110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0, 190.0, 200.0]
    bn4 = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
    
    # 显示哪些数在范围内
    in_range = [x for x in an4 if lower_bound < x < upper_bound]
    print(f"an4中在范围内的数: {in_range}")
    print(f"排序后的阈值列表: {sorted(set(in_range), reverse=True)}")
    
    difficulty4, ratio4 = calculate_complete_compound_difficulty(an4, bn4)
    print(f"最终复合难度: {difficulty4:.4f}")
    print(f"复合难度占比: {ratio4:.4f}")

def main():
    """主函数，演示使用方法"""
    
    # 示例数据
    an = [115.38, 142.86, 166.67, 150.00, 130.43, 176.47, 120.00, 160.00, 136.36, 111.11]
    bn = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1]
    
    print("=== 复合难度计算系统 ===")
    print(f"数组an: {an}")
    print(f"数组bn: {bn}")
    print(f"an长度: {len(an)}, bn长度: {len(bn)}")
    
    # 计算边界
    lower_bound = 30/260 * 1000
    upper_bound = 30/180 * 1000
    print(f"\n查找范围: ({lower_bound:.2f}, {upper_bound:.2f})")
    
    # 检查哪些数在范围内
    numbers_in_range = [x for x in an if lower_bound < x < upper_bound]
    print(f"在范围内的数: {numbers_in_range}")
    
    if numbers_in_range:
        print(f"去重排序后: {sorted(set(numbers_in_range), reverse=True)}")
    
    # 计算复合难度
    compound_difficulty, difficulty_ratio = calculate_complete_compound_difficulty(an, bn)
    
    print(f"\n计算结果:")
    print(f"最终复合难度: {compound_difficulty:.6f}")
    print(f"复合难度占比: {difficulty_ratio:.6f}")
    
    # 显示详细过程
    print(f"\n详细过程:")
    if not numbers_in_range:
        print(f"1. 没有数在范围内，使用T = {upper_bound:.2f}")
        T = upper_bound
        simple_difficulty = calculate_compound_difficulty(an, bn, T)
        print(f"2. 计算单一复合难度: {simple_difficulty:.6f}")
        print(f"3. 复合难度占比: {simple_difficulty/len(an):.6f}")
    else:
        print(f"1. 找到{len(set(numbers_in_range))}个不同的阈值")
        print(f"2. 使用加权平均法计算最终复合难度")
        print(f"3. 加权平均结果: {compound_difficulty:.6f}")
        print(f"4. 占比: {compound_difficulty/len(an):.6f}")

if __name__ == "__main__":
    # 运行测试
    test_complete_calculation()
    
    print("\n" + "="*50 + "\n")
    
    # 运行主演示
    main()
