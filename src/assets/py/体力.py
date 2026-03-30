def find_segments(arr):
    """查找所有可能的体力段"""
    n = len(arr)
    segments = []  # 存储所有体力段的起始和结束索引
    
    for i in range(n):
        current_sum = 0
        for j in range(i, n):
            current_sum += arr[j]
            if current_sum >= 20000:
                # 检查是否满足条件：加上前一个元素时还小于20000
                # 直接用累加值推导，避免 O(n) 的 sum(arr[i:j])
                prev_sum = current_sum - arr[j]
                if prev_sum < 20000:
                    segments.append((i, j, current_sum))
                break
    
    return segments

def find_best_two_segments(arr, segments):
    """找到两个不重叠的体力段，使其包含的元素数量最大"""
    max_total_length = 0
    best_segments = None
    
    n = len(segments)
    
    # 尝试所有可能的体力段组合
    for i in range(n):
        start1, end1, sum1 = segments[i]
        length1 = end1 - start1 + 1
        
        for j in range(i + 1, n):
            start2, end2, sum2 = segments[j]
            length2 = end2 - start2 + 1
            
            # 检查两个体力段是否重叠
            if end1 < start2 or end2 < start1:
                # 不重叠
                total_length = length1 + length2
                if total_length > max_total_length:
                    max_total_length = total_length
                    best_segments = [(start1, end1, sum1), (start2, end2, sum2)]
    
    return best_segments

def calculate_result(arr):
    """主计算函数"""

    # === 新增逻辑：判断数组总和是否小于40000 ===
    total_sum_of_array = sum(arr)
    n = len(arr)
    
    if total_sum_of_array < 40000:
        # 如果整个数组的总和小于40000
        # 则 A = 元素总和 / 元素数量
        A = total_sum_of_array / n if n > 0 else 0
        B = 0
        # 步骤5：计算加权平方平均值
        result = (0.9 * A**2 + 0.1 * B**2) ** 0.5
        return A, B, result
    # === 新增逻辑结束 ===
    
    # === 原有逻辑（当数组总和 >= 40000 时执行）===
    
    # 步骤1：查找所有可能的体力段
    segments = find_segments(arr)
    
    if len(segments) < 2:
        raise ValueError("需要至少两个体力段")
    
    # 步骤2：找到最佳的两个不重叠体力段
    best_segments = find_best_two_segments(arr, segments)
    
    if not best_segments:
        raise ValueError("找不到两个不重叠的体力段")
    
    (start1, end1, sum1), (start2, end2, sum2) = best_segments
    
    # 计算两个体力段的总和和元素数量
    seg1_elements = end1 - start1 + 1
    seg2_elements = end2 - start2 + 1
    total_elements_in_segments = seg1_elements + seg2_elements
    total_sum_in_segments = sum1 + sum2
    
    # 步骤3：计算体力密度A
    A = total_elements_in_segments / total_sum_in_segments *1000 if total_sum_in_segments > 0 else 0
    
    # 步骤4：计算休息段
    # 找出休息段的索引
    rest_indices = []
    for i in range(len(arr)):
        if not (start1 <= i <= end1 or start2 <= i <= end2):
            rest_indices.append(i)
    
    if rest_indices:
        rest_sum = sum(arr[i] for i in rest_indices)
        B = len(rest_indices) / rest_sum *1000
    else:
        B = 0
    
    # 步骤5：计算加权平方平均值
    result = (0.9 * A**2 + 0.1 * B**2) ** 0.5
    
    return A, B, result

def main():
    # 示例输入
    # 这里使用一个示例数组，你可以替换为实际的输入
    arr = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
    
    try:
        A, B, result = calculate_result(arr)
        print(f"体力密度 A: {A:.2f}")
        print(f"休息密度 B: {B:.2f}")
        print(f"加权平方平均值: {result:.2f}")
        
        # 输出结果（根据要求输出A和B的平方平均值）
        return result
    except ValueError as e:
        print(f"错误: {e}")
        return None

if __name__ == "__main__":
    main()
